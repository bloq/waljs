
var crypto = require('crypto');


exports.replyJson =
function replyJson(resp, value) {
    output_body = JSON.stringify(value, null, 2) + "\n";

    var output_hash = crypto.createHash('sha256');
    output_hash.update(output_body);
    var output_digest = output_hash.digest('hex');

    resp.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": output_body.length,
        "ETag": output_digest,
    });
    resp.write(output_body);
    resp.end();
};

exports.jrpcReply =
function jrpcReply(jreq, resp, value) {
    jrpcResp = {
	'result': value,
	'error': null,
	'id': jreq.id || null,
    };

    exports.replyJson(resp, jrpcResp);
};

exports.jrpcErr =
function jrpcErr(jreq, resp, code, message) {
    jrpcResp = {
	'code': code,
	'message': message,
	'id': jreq.id || null,
    };

    exports.replyJson(resp, jrpcResp);
};

exports.replyBuffer =
function replyBuffer(resp, output_body) {
    var output_hash = crypto.createHash('sha256');
    output_hash.update(output_body);
    var output_digest = output_hash.digest('hex');

    resp.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": output_body.length,
        "ETag": output_digest,
    });
    resp.write(output_body);
    resp.end();
};

exports.reply400 =
function reply400(resp, msg) {
    resp.writeHead(400, {"Content-Type": "text/plain"});
    resp.write("400 " + msg + "\n");
    resp.end();
};

exports.reply403 =
function reply403(resp) {
    resp.writeHead(403, {"Content-Type": "text/plain"});
    resp.write("403 Access forbidden\n");
    resp.end();
};

exports.reply404 =
function reply404(resp, msg) {
    resp.writeHead(404, {"Content-Type": "text/plain"});
    resp.write("404 not found - " + msg + "\n");
    resp.end();
};

exports.reply500 =
function reply500(resp, msg) {
    resp.writeHead(500, {"Content-Type": "text/plain"});
    resp.write("500 Internal server error: " + msg + "\n");
    resp.end();
};

