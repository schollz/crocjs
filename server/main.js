var files = [];
var isConnected = false;
var relativeDirectory = "";
var socket; // websocket
var connecting = false;


function consoleLog(s) {
    console.log(s);
    if (typeof s === 'object') {
        s = JSON.stringify(s);
    }

    if (!(s.startsWith("[debug]"))) {
        document.getElementById("consoleText").value = document.getElementById("consoleText").value + s + "\n";
        document.getElementById("consoleText").scrollTop = document.getElementById("consoleText").scrollHeight;
    }
}

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

var Name = "";
var filesize = 0;

(function(Dropzone) {
    Dropzone.autoDiscover = false;

    let drop = new Dropzone('div#filesBox', {
        maxFiles: 1000,
        url: '/',
        method: 'post',
        createImageThumbnails: false,
        previewTemplate: "<div id='preview' class='.dropzone-previews'></div>",
        autoProcessQueue: false,
    });


    drop.on('addedfile', function(file) {

        if (!(socket) && !(connecting)) {
            socketCloseListener();
        }


        // console.log(file);
        var domain = document.getElementById("inputDomain").value
        files.push(file);
        if (files.length == 1) {
            relativeDirectory = file.webkitRelativePath.split("/")[0];
        } else if (file.webkitRelativePath.split("/")[0] != relativeDirectory) {
            relativeDirectory = "";
        }



        var filesString = "files are";
        var domainName = `${window.publicURL}/${domain}/`;
        if (files.length == 1) {
            filesString = "file is"
            domainName += `${file.name}`
        }

        document.getElementById("consoleHeader").innerHTML =
            `<p>Your ${filesString} available at:<br> <center><strong><a href="${domainName}" target="_blank">${domainName}</a></strong></center></p>`;
        html = `<ul>`
        for (i = 0; i < files.length; i++) {
            var urlToFile = files[i].name;
            if ('fullPath' in files[i]) {
                urlToFile = files[i].fullPath;
            }
            html = html +
                `<li><a href="/${domain}/${urlToFile}" target="_blank">/${urlToFile}</a></li>`
        }
        html = html + `</ul>`;
        document.getElementById("fileList").innerHTML = html;
        document.getElementById("filesBox").classList.add("hide");
        document.getElementById("console").classList.remove("hide");
        document.getElementById("inputDomain").readOnly = "true";
    })

})(Dropzone);



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
        consoleLog("[debug] ws-> " + jsonData.substring(0, 99))
    } else {
        consoleLog("[debug] ws-> " + jsonData)
    }
}

const socketMessageListener = (event) => {
    var data = JSON.parse(event.data);
    consoleLog(data);
};

const socketOpenListener = (event) => {
    connecting = false;
    consoleLog('[info] connected');
    if (isConnected == true) {
        // reconnect if was connected and got disconnected
        socketSend({
            type: "domain",
            message: document.getElementById("inputDomain").value,
            key: document.getElementById("inputKey").value,
        })
    }
};

const socketCloseListener = (event) => {
    if (socket) {
        consoleLog('[info] disconnected');
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
        consoleLog("[info] no connection available")
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
        jlkj = jlkj + 1;
        if (jlkj < 5) {
            console.log(offset, chunkSize);
            chunkReaderBlock(offset, chunkSize, file);
        }
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


// var blocks = []
// parseFile(files[0], function(arrayBuffer) {
//     console.log("reading");
//     var bytes = new Uint8Array(arrayBuffer);
//     var decoder = new TextDecoder('utf8');
//     blocks.push(btoa(decoder.decode(bytes)));
// })
// window.location = 'data:jpg/image;