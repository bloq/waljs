
var bitcore = require('bitcore-lib');
var BufferUtil = bitcore.util.buffer;
const p2p = require('bitcore-p2p');
const P2P_TIMEOUT = 15 * 1000;

function headers(p2pInfo, locators, callback)
{
	var p2pcfg = {
		host:	p2pInfo.host,
		port:	p2pInfo.port,
		network:p2pInfo.network,
	};
	var peer = new p2p.Peer(p2pcfg);
	var timeoutId = null;

	peer.on('ready', function() {
		var opts = {
			starts:	locators,	// array of hashes
			stop:	null,		// hash of last block
		};
		var msg = peer.messages.GetHeaders(opts);
		peer.sendMessage(msg);

		timeoutId = setTimeout(function () {
			peer.disconnect();
			callback(new Error("P2P timeout"));
		}, P2P_TIMEOUT);
	});

	peer.on('headers', function(msg) {
		peer.disconnect();
		clearTimeout(timeoutId);
		callback(null, msg.headers);
	});

	peer.connect();
}
exports.headers = headers;

function getBlock(p2pInfo, hash, callback)
{
	var p2pcfg = {
		host:	p2pInfo.host,
		port:	p2pInfo.port,
		network:p2pInfo.network,
	};
	var peer = new p2p.Peer(p2pcfg);
	var timeoutId = null;

	peer.on('ready', function() {
		var inventory = [
			{ type: 2, hash: BufferUtil.reverse(new Buffer(hash, 'hex')) }
		];
		var msg = peer.messages.GetData(inventory);
		peer.sendMessage(msg);

		timeoutId = setTimeout(function () {
			peer.disconnect();
			callback(new Error("P2P timeout"));
		}, P2P_TIMEOUT);
	});

	peer.on('block', function(msg) {
		peer.disconnect();
		clearTimeout(timeoutId);
		callback(null, msg.block);
	});

	peer.on('notfound', function(msg) {
		peer.disconnect();
		clearTimeout(timeoutId);
		callback(null, null);
	});

	peer.on('reject', function(msg) {
		peer.disconnect();
		clearTimeout(timeoutId);
		callback(null, null);
	});

	peer.connect();
}
exports.getBlock = getBlock;

