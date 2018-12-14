'use strict'

// モジュールの機能をELとして使う
// import functions as EL object
var EL = require('echonet-lite');
var EPC = require('./const-epc');

// 自分自身のオブジェクトを決める
// set EOJ for this script
// initializeで設定される，必ず何か設定しないといけない，今回はコントローラ
// this EOJ list is required. '05ff01' is a controller.
var objList = ['05ff01'];

global.waifForAnswer = false;
global.get_properties = [EPC.DELTA_DENRYOKU, EPC.NOW_DENRYOKU, EPC.NOW_DENRYUU];
// global.get_properties = [EPC.DELTA_DENRYOKU];

function test(rinfo, els) {
    if( err ){
        console.dir(err);
    }else{
        // console.log('==============================');
        console.log('Get ECHONET Lite data');
        // console.log('rinfo is ');
        console.dir(rinfo);

        // elsはELDATA構造になっているので使いやすいかも
        // els is ELDATA stracture.
        console.log('----');
        console.log('els is ');
        console.dir(els);

        // ELDATAをArrayにする事で使いやすい人もいるかも
        // convert ELDATA into byte array.
        // console.log('----');
        // console.log( 'ECHONET Lite data array is ' );
        // console.log( EL.ELDATA2Array( els ) );

        // 受信データをもとに，実は内部的にfacilitiesの中で管理している
        // this module manages facilities by receved packets.
        // console.log('----');
        // console.log( 'Found facilities are ' );
        // console.dir( EL.facilities );
    }
}

////////////////////////////////////////////////////////////////////////////
// 初期化するとともに，受信動作をコールバックで登録する
// initialize and setting callback. the callback is called by reseived packet.
var elsocket = EL.initialize( objList, function( rinfo, els, err ) {

	if (!global.waifForAnswer) {
		return;
	}

	// GET(0x62) の応答 (0x72)
	if (els.DEOJ === '05ff01' && els.ESV === EL.GET_RES) {
		// console.log(els.ESV);
		console.log("=---------=");
		console.dir(rinfo);
		console.dir(els.DETAILs);
		console.log("e0=" + els.DETAILs["e0"]);
		console.log("e7=" + els.DETAILs["e7"]);
		console.log("e8=" + els.DETAILs["e8"]);
	}
});

// NetworkのELをすべてsearchしてみよう．
// search ECHONET nodes in local network
// EL.search();

//EL.sendOPC1 = function( ip, seoj, deoj, esv, epc, edt)

if (!global.waifForAnswer) {
	global.waifForAnswer = true;

	// 問い合わせを送信。ただし、連続で送ると相手の負荷が怖いので1秒ずつ間を開ける
	for (var i = 0; i < get_properties.length; i++) {
		setTimeout(function(prop) {
			console.log("send req " + prop);
			EL.sendOPC1('10.1.0.100', '05ff01', '028801', EL.GET, prop, "");
		},(i * 1000), global.get_properties[i]);
	}
}

setTimeout(function(sock) {
	console.log("Exiting.");
	sock.close();
} , 10000, elsocket);
