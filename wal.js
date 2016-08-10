#!/usr/bin/env nodejs

const fs = require('fs');
const dns = require('dns');
const program = require('commander');
const async = require('async');
const bitcore = require('bitcore-lib');
const RpcClient = require('bitcoind-rpc');

program
	.version('0.0.1')
	.option('-f, --file <path>', 'Wallet file')
	.option('--rpcinfo <path>', 'bitcoind RPC credentials & configuration')
	.option('--cache <path>', 'Cache file')
	.option('--create', 'Create new wallet')
	.option('--check', 'Validate wallet integrity')
	.option('--accountNew <name>', 'Create new account')
	.option('--accountDefault <name>', 'Set default account to <name>')
	.option('--accountList', 'List accounts')
	.option('--addressNew', 'Generate new address for default account')
	.option('--addressLast', 'Show most recently generated address for default account')
	.option('--netSeed', 'Seed network peer list via DNS')
	.option('--syncHeaders', 'Cache block headers for best chain')
	.parse(process.argv);

var network = bitcore.Networks.livenet;

var wallet = null;
var walletFn = 'keys-wal.json';
var modified = false;

var cache = null;
var cacheFn = 'cache-wal.json';
var cacheModified = false;

var rpcInfoFn = program.rpcinfo || 'rpc-info.json';
var rpcInfoObj = null;

function rpcInfoRead()
{
	rpcInfoObj = JSON.parse(fs.readFileSync(rpcInfoFn, 'utf8'));
}

function cacheRead()
{
	if (program.cache) cacheFn = program.cache;
	if (fs.existsSync(cacheFn))
		cache = JSON.parse(fs.readFileSync(cacheFn, 'utf8'));
	else
		cache = {
			peers: {},

			blocks: {
			 "000000000000000002cce816c0ab2c5c269cb081896b7dcb34b8422d6b74ffa1": {
				"height": 420000,
				"time": 1468082773,
				"merkleroot": "028323a5bcacb0057274ee0a4366e5671278bc736b57176d9bb929c3a69e0ffa",
				"previousblockhash":"000000000000000003035bc31911d3eea46c8a23b36d6d558141d1d09cc960cf",
			 }
			},
			bestBlock: null,
			wantHeader: null,

			matchAddresses: {},
		};
}

function cacheWrite()
{
	if (!cacheModified)
		return;

	fs.writeFile(cacheFn + ".tmp", JSON.stringify(cache, null, 2) + "\n",
		     function (err) {
		if (err) {
			console.error("Write failed for " + cacheFn + ".tmp: " + err);
			return;
		}

		fs.rename(cacheFn + ".tmp", cacheFn, function (err) {
			if (err) {
				console.error("Rename failed for " + cacheFn + ".tmp: " + err);
				return;
			}

			cacheModified = false;
		});
	});


}

function cacheNetPeer(addr)
{
	if (addr in cache.peers)
		return;

	var now = new Date();

	var peerObj = {
		address: addr,
		createTime: now.toISOString(),
	};

	cache.peers[addr] = peerObj;
	cacheModified = true;
}

function walletRead()
{
	if (program.file) walletFn = program.file;
	wallet = JSON.parse(fs.readFileSync(walletFn, 'utf8'));
}

function walletWrite()
{
	if (!modified)
		return;

	if (fs.existsSync(walletFn))
		fs.renameSync(walletFn, walletFn + ".bak");

	fs.writeFileSync(walletFn, JSON.stringify(wallet, null, 2) + "\n");

	modified = false;
}

function walletCreate()
{
	var hdPrivateKey = new bitcore.HDPrivateKey();
	wallet = {
		version: 1000000,
		privkeys: [
			{ typ: "xpriv", 
			  data: hdPrivateKey.toString(), }
		],
		accounts: {},
		defaultAccount: "master",
		nextIndex: 0,
	};

	cmdAccountNew("master");

	modified = true;
}

function cmdCheck()
{
	var n_checked = 0;

	wallet.privkeys.forEach(function(privkey) {
		if (privkey.typ == "xpriv") {
			var hdpk = new bitcore.HDPrivateKey(privkey.data)
		} else {
			console.error("Invalid key type");
			return;
		}

		n_checked++;
	});

	console.log("Keys checked: " + n_checked.toString());
}

function cmdAccountList()
{
	Object.keys(wallet.accounts).forEach(function(acctName) {
		console.log(acctName);
	});
}

function cmdAccountNew(acctName)
{
	if (acctName in wallet.accounts) {
		console.error("Duplicate account name");
		return;
	}

	var now = new Date();

	var obj = {
		name: acctName,
		index: wallet.nextIndex,
		nextKey: 0,
		createTime: now.toISOString(),
	};

	wallet.accounts[acctName] = obj;
	wallet.nextIndex++;

	modified = true;
}

function cmdAccountDefault(acctName)
{
	if (acctName in wallet.accounts) {
		wallet.defaultAccount = acctName;
		modified = true;
	} else {
		console.error("unknown account");
		return;
	}
}

function cmdAccountAddress(newAddr)
{
	var privkeyObj = wallet.privkeys[0];
	var acctObj = wallet.accounts[wallet.defaultAccount];

	var keyIndex;
	if (newAddr)
		keyIndex = acctObj.nextKey;
	else {
		if (acctObj.nextKey == 0) {
			console.error("no key yet generated");
			return;
		}

		keyIndex = acctObj.nextKey - 1;
	}

	// Verify this is BIP 44 etc. compatible
	var hdpath_hard = "m/44'/0'/" +
		     acctObj.index.toString() + "'";
	var hdpath_pub = "m/0/" +
		     keyIndex.toString();

	// Get pubkey for hardened path
	var hdpriv = new bitcore.HDPrivateKey(privkeyObj.data);
	var derivedKey = hdpriv.derive(hdpath_hard);
	var hdpub = derivedKey.hdPublicKey;

	// Derive address for public path
	var address = new bitcore.Address(hdpub.derive(hdpath_pub).publicKey,
					  network);

	// Output [generated] address
	var addressStr = address.toString();
	console.log(addressStr);

	if (newAddr) {
		var now = new Date();

		var matchObj = {
			address: addressStr,
			createTime: now.toISOString(),
			acctIndex: acctObj.index,
			keyIndex: keyIndex,
			change: false,
		};

		acctObj.nextKey++;
		modified = true;

		cache.matchAddresses[addressStr] = matchObj;
		cacheModified = true;
	}
}

function cmdNetSeed()
{
	var seeds = network.dnsSeeds;

	var lenStart = Object.keys(cache.peers).length;

	async.each(seeds, function iteree(hostname, cb) {
		dns.resolve4(hostname, function (err, addresses) {
			if (err) {
				cb(err);
				return;
			}

			addresses.forEach(function(addr) {
				cacheNetPeer(addr);
			});

			cb();
		});
	}, function done() {
		cacheWrite();

		var lenEnd = Object.keys(cache.peers).length;
		var lenDiff = lenEnd - lenStart;

		console.log("Peers seeded from DNS.  New peers discovered: " + lenDiff.toString());
	});
}

function downloadHeaders(rpc)
{
	var n_headers = 0;

	async.until(function tester() {
		return (cache.wantHeader && (cache.wantHeader in cache.blocks));
	}, function iteree(callback) {
		rpc.getBlockHeader(cache.wantHeader, function(err, res) {
			if (err) {
				console.error("Block header failed, " + err);
				callback(err);
				return;
			}

			var obj = {
				height: res.result.height,
				time: res.result.time,
				merkleroot: res.result.merkleroot,
				previousblockhash: res.result.previousblockhash,
			};

			cache.blocks[cache.wantHeader] = obj;
			cacheModified = true;

			if (obj.previousblockhash && obj.height > 0)
				cache.wantHeader = obj.previousblockhash;

			n_headers++;
			callback();
		});
	}, function done() {
		cacheWrite();
		console.log(n_headers.toString() + " headers downloaded.");
		console.log("Tip " + cache.bestBlock);
	});
}

function cmdSyncHeaders()
{
	rpcInfoRead();

	const rpc = new RpcClient(rpcInfoObj);
	rpc.getBestBlockHash(function(err, res) {
		if (err) {
			console.error("Cannot get best block hash: " + err);
			return;
		}

		var newBestBlock = res.result;

		if (newBestBlock != cache.bestBlock) {
			cache.bestBlock = res.result;
			cacheModified = true;

			cache.wantHeader = cache.bestBlock;
			downloadHeaders(rpc);
		}
	});
}

if (program.create) {
	walletCreate();
} else
	walletRead();
cacheRead();

if (program.check)
	cmdCheck();
else if (program.accountNew)
	cmdAccountNew(program.accountNew);
else if (program.accountDefault)
	cmdAccountDefault(program.accountDefault);
else if (program.accountList)
	cmdAccountList();
else if (program.addressNew)
	cmdAccountAddress(true);
else if (program.addressLast)
	cmdAccountAddress(false);
else if (program.netSeed)
	cmdNetSeed();
else if (program.syncHeaders)
	cmdSyncHeaders();

walletWrite();
cacheWrite();

