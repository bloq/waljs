
const http = require('http');

function req(rpcInfoObj, path, isBinary, callback)
{
	const restOptions = {
		protocol: "http:",
		hostname: rpcInfoObj.host,
		port: parseInt(rpcInfoObj.port),
		path: path,
		method: 'GET',
	};

	// Download via HTTP REST
	var req = http.request(restOptions, function(res) {

		var bufs = [];

		res.on('data', function(chunk) {
			bufs.push(chunk);
		});

		res.on('end', function() {
			var rawdata = Buffer.concat(bufs);

			if (isBinary)
				callback(null, rawdata);
			else {
				try {
					var s = rawdata.toString('utf8');
					var jval = JSON.parse(s);
				}
				catch (e) {
					callback(e);
				}
				callback(null, jval);
			}
		});
	});

	req.on('error', function(err) {
		callback(err);
	});

	req.end();
}

function headers(rpcInfoObj, scanHash, count, callback)
{
	req(rpcInfoObj,
	    "/rest/headers/" + count.toString() + "/" + scanHash + ".json",
	    false, callback);
}
exports.headers = headers;

function block(rpcInfoObj, scanHash, callback)
{
	req(rpcInfoObj, "/rest/block/" + scanHash + ".bin", true, callback);
}
exports.block = block;

function chaininfo(rpcInfoObj, callback)
{
	req(rpcInfoObj, "/rest/chaininfo.json", false, callback);
}
exports.chaininfo = chaininfo;

