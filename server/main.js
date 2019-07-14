var socket; // websocket

function humanFileSize(bytes, si) {
    var thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }
    var units = si ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB',
        'EiB', 'ZiB', 'YiB'
    ];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
}


/* websockets */
function socketSend(data) {
    if (socket == null) {
        return
    }
    if (socket.readyState != 1) {
        return
    }
    jsonData = JSON.stringify(data);
    socket.send(jsonData);
    if (jsonData.length > 100) {
        console.log("[debug] ws-> " + jsonData.substring(0, 99))
    } else {
        console.log("[debug] ws-> " + jsonData)
    }
}

const socketMessageListener = (event) => {
    var data = JSON.parse(event.data);
    console.log(data);
};

const socketOpenListener = (event) => {
    console.log('[info] connected');
};

const socketCloseListener = (event) => {
    if (socket) {
        console.log('[info] disconnected');
    }
    var url = window.origin.replace("http", "ws") + '/ws?room=' + document.getElementById("inputDomain").value;
    try {
        connecting = true;
        socket = new WebSocket(url);
        socket.addEventListener('open', socketOpenListener);
        socket.addEventListener('message', socketMessageListener);
        socket.addEventListener('close', socketCloseListener);
    } catch (err) {
        connecting = false;
        console.log("[info] no connection available")
    }
};



function parseFile(file, callback) {
    var fileSize = file.size;
    var chunkSize = 64; // bytes
    var offset = 0;
    var self = this; // we need a reference to the current object
    var chunkReaderBlock = null;

    var readEventHandler = function(evt) {
        if (evt.target.error == null && offset != null) {
            offset += evt.target.result.byteLength;
            callback(evt.target.result); // callback for handling read chunk
        } else {
            console.log("Read error: " + evt.target.error);
            return;
        }
        if (offset >= fileSize) {
            console.log("Done reading file");
            return;
        }
        if (offset == null || offset == undefined || file == null || file == undefined) {
            console.log("?");
            return
        }

        // of to the next chunk
        chunkReaderBlock(offset, chunkSize, file);
    }

    chunkReaderBlock = function(_offset, length, _file) {
        var r = new FileReader();
        console.log(_offset, length + _offset)
        var blob = _file.slice(_offset, length + _offset);
        r.onload = readEventHandler;
        r.readAsArrayBuffer(blob);
    }

    // now let's start the read with the first block
    chunkReaderBlock(offset, chunkSize, file);
}

function send(e) {
    console.log("sending");
    socketCloseListener();
}

function receive(e) {
    console.log("receving");
    socketCloseListener();
}

document.getElementById("buttonSend").addEventListener("click", send);
document.getElementById("buttonReceive").addEventListener("click", receive);

// var blocks = []
// parseFile(document.getElementById("avatar").files[0], function(arrayBuffer) {
//     console.log("reading");
//     var bytes = new Uint8Array(arrayBuffer);
//     var decoder = new TextDecoder('utf8');
//     blocks.push(btoa(decoder.decode(bytes)));
// })
// window.location = 'data:jpg/image;