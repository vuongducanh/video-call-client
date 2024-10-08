var localVideo;
var firstPerson = false;
var socketCount = 0;
var socketId;
var localStream;
var connections = [];

var peerConnectionConfig = {
  iceServers: [
    { urls: "stun:stun.services.mozilla.com" },
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

function pageReady() {
  localVideo = document.getElementById("localVideo");

  var constraints = {
    video: true,
    audio: true,
  };

  if (navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(getUserMediaSuccess)
      .then(function () {
        socket = io.connect(config.host, { secure: true });
        socket.on("signal", gotMessageFromServer);

        socket.on("connect", function () {
          socketId = socket.id;

          socket.on("user-left", function (id) {
            var video = document.querySelector('[data-socket="' + id + '"]');
            var parentDiv = video.parentElement;
            video.parentElement.parentElement.removeChild(parentDiv);
          });

          socket.on("user-joined", function (data) {
            const {id, count, clients } = data

            clients.forEach(function (socketListId) {
              if (!connections[socketListId]) {
                connections[socketListId] = new RTCPeerConnection(
                  peerConnectionConfig
                );
                //Wait for their ice candidate
                connections[socketListId].onicecandidate = function (event) {
                  if (event.candidate != null) {
                    socket.emit(
                      "signal",
                      socketListId,
                      JSON.stringify({ ice: event.candidate })
                    );
                  }
                };

                //Wait for their video stream
                connections[socketListId].onaddstream = function (event) {
                  gotRemoteStream(event, socketListId);
                };

                //Add the local video stream
                connections[socketListId].addStream(localStream);
              }
            });

            //Create an offer to connect with your local description

            if (count >= 2) {
              connections[id].createOffer().then(function (description) {
                connections[id]
                  .setLocalDescription(description)
                  .then(function () {
                    socket.emit(
                      "signal",
                      id,
                      JSON.stringify({ sdp: connections[id].localDescription })
                    );
                  })
                  .catch((e) => {});
              });
            }
          });
        });
      });
  } else {
    alert("Your browser does not support getUserMedia API");
  }
}

function getUserMediaSuccess(stream) {
  localStream = stream;
  localVideo.srcObject = stream;
  localVideo.muted = true;
}

function gotRemoteStream(event, id) {
  var videos = document.querySelectorAll("video"),
    video = document.createElement("video"),
    div = document.createElement("div");

  video.setAttribute("data-socket", id);
  // video.src         = window.URL.createObjectURL(event.stream);
  video.srcObject = event.stream;
  video.autoplay = true;
  video.playsinline = true;
  video.play();

  div.appendChild(video);
  document.querySelector(".videos").appendChild(div);
}

function gotMessageFromServer(fromId, message) {
  //Parse the incoming signal
  var signal = JSON.parse(message);

  //Make sure it's not coming from yourself
  if (fromId != socketId) {
    if (signal.sdp) {
      connections[fromId]
        .setRemoteDescription(new RTCSessionDescription(signal.sdp))
        .then(function () {
          if (signal.sdp.type == "offer") {
            connections[fromId]
              .createAnswer()
              .then(function (description) {
                connections[fromId]
                  .setLocalDescription(description)
                  .then(function () {
                    socket.emit(
                      "signal",
                      fromId,
                      JSON.stringify({
                        sdp: connections[fromId].localDescription,
                      })
                    );
                  })
                  .catch((e) => {});
              })
              .catch((e) => {});
          }
        })
        .catch((e) => {});
    }

    if (signal.ice) {
      connections[fromId]
        .addIceCandidate(new RTCIceCandidate(signal.ice))
        .catch((e) => {});
    }
  }
}

console.log("connections = ", connections);
