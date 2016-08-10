#!/usr/bin/env nodejs

const fs = require('fs');
const program = require('commander');
const bitcore = require('bitcore-lib');

program
	.version('0.0.1')
	.option('-f, --file <path>', 'Wallet file')
	.option('--create', 'Create new wallet')
	.option('--check', 'Validate wallet integrity')
	.parse(process.argv);

var wallet = null;
var walletFn = 'stor-wallet-keys.json';
var modified = false;

function walletRead()
{
	if (program.file) walletFn = program.file;
	wallet = JSON.parse(fs.readFileSync(walletFn, 'utf8'));
}

function walletWrite()
{
	if (fs.existsSync(walletFn))
		fs.renameSync(walletFn, walletFn + ".bak");

	fs.writeFileSync(walletFn, JSON.stringify(wallet, null, 2) + "\n");
}

function walletCreate()
{
	var hdPrivateKey = new bitcore.HDPrivateKey();
	wallet = {
		version: 1000000,
		privkeys: [
			{ typ: "xpriv", 
			  data: hdPrivateKey.toString(), }
		]
	};
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

if (program.create) {
	walletCreate();
	modified = true;
} else
	walletRead();

if (program.check)
	cmdCheck();

if (modified)
	walletWrite();

