
const p2p = require('bitcore-p2p');

function headers(p2pInfo, locators, callback)
{
	var p2pcfg = {
		host:	p2pInfo.host,
		port:	p2pInfo.port,
	};
	var peer = new p2p.Peer(p2pcfg);

	peer.on('ready', function() {
		var opts = {
			starts:	locators,	// array of hashes
			stop:	null,		// hash of last block
		};
		var msg = peer.messages.GetHeaders(opts);
		peer.sendMessage(msg);
	});

	peer.on('headers', function(msg) {
		callback(null, msg.headers);
		peer.disconnect();
	});

	peer.connect();
}
exports.headers = headers;

