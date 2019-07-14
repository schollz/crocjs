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


var blocks = []


parseFile(files[0], function(arrayBuffer) {
    console.log("reading");
    var bytes = new Uint8Array(arrayBuffer);
    var decoder = new TextDecoder('utf8');
    blocks.push(btoa(decoder.decode(bytes)));
})

window.location = 'data:jpg/image;