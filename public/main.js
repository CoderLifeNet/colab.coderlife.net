const ws = new WebSocket("ws://localhost:3000");
let currentRoomId = null;
let joinedRooms = new Set();
let roomNames = {}; // Store custom room names
let isRoomCreator = false; // Track if the current user is the room creator
let username = localStorage.getItem("username") || null;
let roomName = null;
let editor = null;
let userCursors = {}; // Store the cursors of other users
let ignoreEditorChange = false; // Flag to ignore changes from WebSocket messages

const roomIdFromUrl = window.location.pathname.split("/box/")[1];
const domainName = "yourdomain.com"; // Set your domain name here

// Initialize CodeMirror
function initializeEditor() {
  if (!editor) {
    // Temporarily show the editor for initialization
    const editorContainer = document.getElementById("editor-container");
    const editorElement = document.getElementById("editor");
    const originalDisplay = editorContainer.style.display;
    editorContainer.style.display = "block";

    editor = CodeMirror.fromTextArea(editorElement, {
      lineNumbers: true,
      mode: "javascript",
      theme: "juejin",
      autoCloseBrackets: true,
      styleActiveLine: true,
      viewportMargin: Infinity, // Ensure full height
    });

    editor.on("change", (instance, changeObj) => {
      if (ignoreEditorChange) return; // Ignore changes from WebSocket messages
      if (currentRoomId) {
        const text = instance.getValue();
        ws.send(
          JSON.stringify({
            type: "SEND_MESSAGE",
            roomId: currentRoomId,
            message: text,
            from: username,
          })
        );
      }
    });

    editor.on("cursorActivity", () => {
      const cursor = editor.getCursor();
      ws.send(
        JSON.stringify({
          type: "CURSOR_MOVED",
          roomId: currentRoomId,
          cursor,
          username,
        })
      );
    });

    // Restore the original display property
    editorContainer.style.display = originalDisplay;
  }
}

// Initialize event listeners
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("createRoom").addEventListener("click", () => {
    if (!username) {
      showUsernameModal(() => {
        showRoomNameModal(() => {
          createRoom();
        });
      });
    } else {
      showRoomNameModal(() => {
        createRoom();
      });
    }
  });

  document.getElementById("joinRoomButton").addEventListener("click", () => {
    if (!username) {
      showUsernameModal(() => {
        showJoinRoomModal();
      });
    } else {
      showJoinRoomModal();
    }
  });

  document.getElementById("joinRoom").addEventListener("click", () => {
    const roomId = document.getElementById("joinRoomId").value;
    if (validateRoomId(roomId)) {
      $("#joinRoomModal").modal("hide");
      joinRoom(roomId);
    } else {
      alert("Invalid room ID");
    }
  });

  document.getElementById("saveUsername").addEventListener("click", () => {
    const usernameInput = document.getElementById("usernameInput").value;
    if (usernameInput) {
      username = usernameInput;
      localStorage.setItem("username", username);
      $("#usernameModal").modal("hide");
      if (typeof postUsernameSaveCallback === "function") {
        postUsernameSaveCallback();
      }
    }
  });

  document.getElementById("saveRoomName").addEventListener("click", () => {
    const roomNameInput = document.getElementById("roomNameInput").value;
    if (roomNameInput) {
      roomName = roomNameInput;
      $("#roomNameModal").modal("hide");
      if (typeof postRoomNameSaveCallback === "function") {
        postRoomNameSaveCallback();
      }
    }
  });

  // Add event listeners for the new buttons
  document.getElementById("downloadPdf").addEventListener("click", downloadPdf);
  document.getElementById("downloadTxt").addEventListener("click", downloadTxt);
  document.getElementById("copyText").addEventListener("click", copyText);
  document
    .getElementById("leaveRoom")
    .addEventListener("click", showLeaveRoomModal);

  document.getElementById("confirmLeaveRoom").addEventListener("click", () => {
    $("#leaveRoomModal").modal("hide");
    leaveRoom(currentRoomId);
  });

  // Add event listeners for "Enter" key on relevant input fields
  document
    .getElementById("joinRoomId")
    .addEventListener("keypress", (event) => {
      if (event.key === "Enter" && event.target.value) {
        document.getElementById("joinRoom").click();
      }
    });
  document
    .getElementById("usernameInput")
    .addEventListener("keypress", (event) => {
      if (event.key === "Enter" && event.target.value) {
        document.getElementById("saveUsername").click();
      }
    });
  document
    .getElementById("roomNameInput")
    .addEventListener("keypress", (event) => {
      if (event.key === "Enter" && event.target.value) {
        document.getElementById("saveRoomName").click();
      }
    });

  // Ensure the first input in each modal is focused when the modal is shown
  $(".modal").on("shown.bs.modal", function () {
    $(this).find("input:text:visible:first").focus();
  });

  if (roomIdFromUrl) {
    ws.onopen = () => {
      console.log("Joining room from URL:", roomIdFromUrl);
      joinRoom(roomIdFromUrl);
    };
  } else {
    loadRoomsFromLocalStorage();
  }
});

let postUsernameSaveCallback = null;
let postRoomNameSaveCallback = null;

const handlers = {
  ROOM_CREATED: (data) => {
    currentRoomId = data.roomId;
    console.log(`Room created with ID: ${currentRoomId}`);
    window.history.pushState({}, "", `/box/${currentRoomId}`);
    roomNames[currentRoomId] = roomName;
    addRoomToList(currentRoomId);
    updateRoomName(currentRoomId, roomName);
    isRoomCreator = true; // Set the creator flag
    showEditor();
    saveCurrentRoomIdToLocalStorage();
  },
  JOINED_ROOM: (data) => {
    currentRoomId = data.roomId;
    showEditor();
    ignoreEditorChange = true;
    editor.setValue(data.text); // Set the editor content
    ignoreEditorChange = false;
    console.log(`Joined room: ${currentRoomId}`);
    window.history.pushState({}, "", `/box/${currentRoomId}`);
    roomNames[currentRoomId] = data.roomName;
    addRoomToList(currentRoomId);
    updateRoomName(currentRoomId, data.roomName);
    isRoomCreator = data.isCreator; // Set the creator flag based on server response
    saveCurrentRoomIdToLocalStorage();
  },
  NEW_MEMBER: (data) =>
    console.log(`A new member has joined room: ${data.roomId}`),
  MESSAGE: (data) => {
    if (currentRoomId === data.roomId) {
      const cursor = editor.getCursor(); // Save the current cursor position
      ignoreEditorChange = true;
      editor.setValue(data.message); // Update the editor content
      editor.setCursor(cursor); // Restore the cursor position
      ignoreEditorChange = false;
    } else {
      addIndicatorToRoom(data.roomId); // Add indicator if message is for a different room
    }
  },
  CURSOR_MOVED: (data) => {
    if (data.username !== username) {
      const cursorPos = editor.posFromIndex(data.cursor);
      if (!userCursors[data.username]) {
        const cursorElement = document.createElement("span");
        cursorElement.className = "user-cursor";
        cursorElement.textContent = data.username;
        userCursors[data.username] = cursorElement;
      }
      editor.addWidget(cursorPos, userCursors[data.username], true);
    }
  },
  ROOM_CLOSED: (data) => {
    if (currentRoomId === data.roomId) {
      alert('This room has been closed by the creator.');
      currentRoomId = null;
      saveCurrentRoomIdToLocalStorage();
      showContext();
      window.history.pushState({}, "", `/`);
    }
    joinedRooms.delete(data.roomId);
    delete roomNames[data.roomId];
    saveRoomsToLocalStorage();
    updateRoomList(); // Update the room list in the UI
  },
  ROOM_RENAMED: (data) => {
    roomNames[data.roomId] = data.newName;
    if (currentRoomId === data.roomId) {
      updateRoomName(data.roomId, data.newName);
    }
    updateRoomList();
  },
  STATS_UPDATE: (data) => {
    document.getElementById(
      "participantCount"
    ).textContent = `Participants: ${data.totalParticipants}`;
    document.getElementById(
      "roomCount"
    ).textContent = `Active Rooms: ${data.activeRooms}`;
  },
  LEFT_ROOM: (data) => {
    if (currentRoomId === data.roomId) {
      currentRoomId = null;
      showContext();
      window.history.pushState({}, "", `/`);
    }
    joinedRooms.delete(data.roomId);
    delete roomNames[data.roomId];
    saveRoomsToLocalStorage();
    updateRoomList(); // Update the room list in the UI
  },
  ERROR: (data) => {
    if (data.message === "Room not found") {
      console.log(`Room not found: ${data.roomId}`);
      joinedRooms.delete(data.roomId);
      saveRoomsToLocalStorage();
      if (currentRoomId === data.roomId) {
        currentRoomId = null;
        saveCurrentRoomIdToLocalStorage();
        showContext();
        window.history.pushState({}, "", `/`);
      } else {
        showContext();
      }
      updateRoomList();
    } else {
      console.log(`Error: ${data.message}`);
    }
  },
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("WebSocket message received:", data);
  console.log("Handling message type:", data.type);
  if (handlers[data.type]) handlers[data.type](data);
};

function createRoom() {
  ws.send(JSON.stringify({ type: "CREATE_ROOM", username, roomName }));
}

function joinRoom(roomId) {
  if (!joinedRooms.has(roomId)) {
    ws.send(JSON.stringify({ type: "JOIN_ROOM", roomId, username }));
  }
}

function leaveRoom(roomId) {
    if (joinedRooms.has(roomId)) {
      ws.send(JSON.stringify({ type: "LEAVE_ROOM", roomId, username }));
      joinedRooms.delete(roomId);
      delete roomNames[roomId];
      saveRoomsToLocalStorage();
      updateRoomList(); // Update the room list in the UI
      if (currentRoomId === roomId) {
        currentRoomId = null;
        saveCurrentRoomIdToLocalStorage();
        showContext();
        window.history.pushState({}, "", `/`);
      }
    }
  }


function updateRoomName(roomId, newName = null) {
  const roomName = newName || roomNames[roomId] || roomId;
  document.getElementById("roomNameText").textContent = roomName;
  roomNames[roomId] = roomName;
  saveRoomsToLocalStorage();
}

function addRoomToList(roomId) {
  if (!joinedRooms.has(roomId)) {
    joinedRooms.add(roomId);
    saveRoomsToLocalStorage();
    const roomList = document.getElementById("roomList");
    roomList.appendChild(createRoomListItem(roomId, roomNames[roomId]));
  }
}

function switchRoom(roomId) {
  currentRoomId = roomId;
  ws.send(JSON.stringify({ type: "JOIN_ROOM", roomId, username }));
  updateRoomName(roomId);
  saveCurrentRoomIdToLocalStorage();
  showEditor();
  window.history.pushState({}, "", `/box/${roomId}`); // Update URL
  removeIndicatorFromRoom(roomId); // Remove indicator when switching to the room
}

function openRoomSettingsModal(roomId) {
  const modal = $("#roomSettingsModal");
  modal.modal("show");
  modal.find(".modal-title").text(`Room Settings: ${roomId}`);
  modal.find(".modal-body input").val(roomNames[roomId] || roomId);

  if (isRoomCreator) {
    modal.find(".additional-options").show();
    modal.find(".close-room").show(); // Show Close Room button
  } else {
    modal.find(".additional-options").hide();
    modal.find(".close-room").hide(); // Hide Close Room button
  }

  $("#saveRoomSettings")
    .off("click")
    .on("click", () => {
      const newRoomName = modal.find(".modal-body input").val();
      ws.send(
        JSON.stringify({ type: "RENAME_ROOM", roomId, newName: newRoomName })
      );
      modal.modal("hide");
    });

  $("#closeRoom")
    .off("click")
    .on("click", () => {
      ws.send(JSON.stringify({ type: "CLOSE_ROOM", roomId }));
      modal.modal("hide");
    });
}

function updateRoomList() {
  const roomList = document.getElementById("roomList");
  roomList.innerHTML = ""; // Clear current list
  joinedRooms.forEach((roomId) => {
    roomList.appendChild(createRoomListItem(roomId, roomNames[roomId]));
  });
}

function createRoomListItem(roomId, roomName) {
  const listItem = document.createElement("li");
  listItem.className =
    "list-group-item d-flex justify-content-between align-items-center";
  listItem.innerHTML = `<span>${roomName}</span>
                        <div>
                          <i class="settings-icon fas fa-cog" data-room-id="${roomId}" data-toggle="modal" data-target="#roomSettingsModal"></i>
                          <i class="share-icon fas fa-share-alt ml-2" data-room-id="${roomId}" title="Copy share link"></i>
                        </div>`;
  listItem
    .querySelector("span")
    .addEventListener("click", () => switchRoom(roomId));
  listItem
    .querySelector(".settings-icon")
    .addEventListener("click", (event) => {
      event.stopPropagation();
      openRoomSettingsModal(roomId);
    });
  listItem.querySelector(".share-icon").addEventListener("click", (event) => {
    event.stopPropagation();
    copyRoomLinkToClipboard(roomId);
  });
  return listItem;
}

function addIndicatorToRoom(roomId) {
  const listItem = document
    .querySelector(`.list-group-item [data-room-id="${roomId}"]`)
    .closest(".list-group-item");
  listItem.classList.add("new-activity");
}

function removeIndicatorFromRoom(roomId) {
  const listItem = document
    .querySelector(`.list-group-item [data-room-id="${roomId}"]`)
    .closest(".list-group-item");
  listItem.classList.remove("new-activity");
}

function copyRoomLinkToClipboard(roomId) {
  const roomLink = `${window.location.origin}/box/${roomId}`;
  navigator.clipboard
    .writeText(roomLink)
    .then(() => {
      console.log(`Room link copied to clipboard: ${roomLink}`);
    })
    .catch((err) => {
      console.error("Failed to copy room link: ", err);
    });
}

function saveRoomsToLocalStorage() {
    localStorage.setItem('joinedRooms', JSON.stringify(Array.from(joinedRooms)));
    localStorage.setItem('roomNames', JSON.stringify(roomNames));
  }

function saveCurrentRoomIdToLocalStorage() {
  localStorage.setItem("currentRoomId", currentRoomId);
}

function loadRoomsFromLocalStorage() {
    const savedJoinedRooms = JSON.parse(localStorage.getItem('joinedRooms')) || [];
    roomNames = JSON.parse(localStorage.getItem('roomNames')) || {};
    currentRoomId = localStorage.getItem('currentRoomId');

    const activeRooms = new Set();

    const pendingChecks = savedJoinedRooms.map(roomId => {
      return new Promise(resolve => {
        const checkWs = new WebSocket("ws://localhost:3000");
        checkWs.onopen = () => {
          checkWs.send(JSON.stringify({ type: 'JOIN_ROOM', roomId, username }));
        };

        checkWs.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'JOINED_ROOM' && data.roomId === roomId) {
            activeRooms.add(roomId);
            resolve(roomId);
          } else if (data.type === 'ERROR' && data.message === 'Room not found') {
            resolve(null);
          }
          checkWs.close();
        };
      });
    });

    Promise.all(pendingChecks).then(results => {
      results.forEach(roomId => {
        if (roomId) {
          joinedRooms.add(roomId);
          addRoomToList(roomId, roomNames[roomId]);
        } else {
          joinedRooms.delete(roomId);
          delete roomNames[roomId];
        }
      });

      saveRoomsToLocalStorage();
      updateRoomList();

      if (!joinedRooms.size) {
        currentRoomId = null;
        saveCurrentRoomIdToLocalStorage();
        showContext();
        window.history.pushState({}, "", `/`);
      } else if (!currentRoomId || !joinedRooms.has(currentRoomId)) {
        showContext();
      } else {
        switchRoom(currentRoomId);
      }
    });
  }

function showEditor() {
  const editorContainer = document.getElementById("editor-container");
  editorContainer.classList.add("d-flex");
  editorContainer.style.display = "block";
  document.getElementById("context").style.display = "none";
  initializeEditor(); // Initialize CodeMirror editor after making it visible
}

function showContext() {
  document.getElementById("editor-container").classList.remove("d-flex");
  document.getElementById("editor-container").style.display = "none";
  document.getElementById("context").style.display = "block";
  if (editor) {
    editor.setValue(""); // Clear the editor
  }
}

function showUsernameModal(callback) {
  postUsernameSaveCallback = callback;
  $("#usernameModal").modal("show");
}

function showRoomNameModal(callback) {
  postRoomNameSaveCallback = callback;
  $("#roomNameModal").modal("show");
}

function showJoinRoomModal() {
  $("#joinRoomModal").modal("show");
}

function showLeaveRoomModal() {
  $("#leaveRoomModal").modal("show");
}

function validateRoomId(roomId) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(roomId);
}

// Function to sanitize and format the room name for the filename
function formatRoomName(roomName) {
  return roomName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

// Function to get the current date in yyyy-mm-dd format
function getCurrentDate() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Function to generate the filename
function generateFilename(extension) {
  const date = getCurrentDate();
  const roomName = formatRoomName(roomNames[currentRoomId] || "room");
  return `${date}_${domainName}_${roomName}.${extension}`;
}

// Function to download the content of the editor as a PDF
function downloadPdf() {
  const text = editor.getValue();
  if (!text) {
    alert("Unable to perform action on empty field");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(text, 180); // Split text into lines for the PDF width

  let y = 10; // Start height for text

  lines.forEach((line) => {
    if (y > 280) {
      // Check if we need to add a new page
      doc.addPage();
      y = 10; // Reset y position for the new page
    }
    doc.text(line, 10, y);
    y += 10; // Move to next line
  });

  const filename = generateFilename("pdf");
  doc.save(filename);
}

// Function to download the content of the editor as a text file
function downloadTxt() {
  const text = editor.getValue();
  if (!text) {
    alert("Unable to perform action on empty field");
    return;
  }

  const blob = new Blob([text], { type: "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  const filename = generateFilename("txt");
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
}

// Function to copy the content of the editor to the clipboard
function copyText() {
  const text = editor.getValue();
  if (!text) {
    alert("Unable to perform action on empty field");
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert("Text copied to clipboard");
    })
    .catch((err) => {
      alert("Failed to copy text: ", err);
    });
}
