'use strict'

// モジュールの機能をELとして使う
// import functions as EL object
var EL = require('echonet-lite');
var EPC = require('./const-epc');
const log4js = require('log4js');

log4js.configure(
	{
		appenders: {
			app: {
				type: "file",
				filename: "log/app.log",
				maxLogSize: 10485760,
				numBackups: 3,
				layout: {
					type: "pattern",
					pattern: "%d{ISO8601_WITH_TZ_OFFSET} %h %p %c %m"
				}
			},
			power: {
				type: "file",
				filename: "log/powerdata.log",
				layout: {
					type: "pattern",
					pattern: "%m"
				}
			},
			stdout: {
				type: "stdout",
				layout: { type: 'basic' }
			}
		},
		categories: {
			default: { appenders: [ "app", "stdout" ], level: "DEBUG" },
			power: { appenders: [ "power" , "stdout"], level: "DEBUG" }
		}
	}
);

global.logger = log4js.getLogger('default');
const logger = global.logger;

global.power_logger = log4js.getLogger('power');
const power_logger = global.power_logger;

global.result = {};

// 自分自身のオブジェクトを決める
// set EOJ for this script
// initializeで設定される，必ず何か設定しないといけない，今回はコントローラ
// this EOJ list is required. '05ff01' is a controller.
var objList = ['05ff01'];

global.waifForAnswer = false;
global.get_properties = [EPC.DELTA_DENRYOKU, EPC.NOW_DENRYOKU, EPC.NOW_DENRYUU, EPC.DELTA_HISTORY];
// global.get_properties = [EPC.DELTA_DENRYOKU];

function test(rinfo, els) {
    if( err ){
        console.dir(err);
    }else{
        // logger.debug('==============================');
        logger.debug('Get ECHONET Lite data');
        // logger.debug('rinfo is ');
        console.dir(rinfo);

        // elsはELDATA構造になっているので使いやすいかも
        // els is ELDATA stracture.
        logger.debug('----');
        logger.debug('els is ');
        logger.debug(els);

        // ELDATAをArrayにする事で使いやすい人もいるかも
        // convert ELDATA into byte array.
        // logger.debug('----');
        // logger.debug( 'ECHONET Lite data array is ' );
        // logger.debug( EL.ELDATA2Array( els ) );

        // 受信データをもとに，実は内部的にfacilitiesの中で管理している
        // this module manages facilities by receved packets.
        // logger.debug('----');
        // logger.debug( 'Found facilities are ' );
        // console.dir( EL.facilities );
    }
}

////////////////////////////////////////////////////////////////////////////
// 初期化するとともに，受信動作をコールバックで登録する
// initialize and setting callback. the callback is called by reseived packet.
var elsocket = EL.initialize( objList, function( rinfo, els, err ) {

	var logger = global.logger;

	if (!global.waifForAnswer) {
		return;
	}

	// GET(0x62) の応答 (0x72)
	if (els.DEOJ === '05ff01' && els.ESV === EL.GET_RES) {
		// logger.debug(els.ESV);
		logger.debug("=---------=");
		logger.debug(rinfo);
		logger.debug("=---------=");
		logger.debug(els);
		logger.debug("=---------=");
		logger.debug(els.DETAILs);
		logger.debug("e0=" + els.DETAILs["e0"] + " " + parseInt(els.DETAILs["e0"], 16));
		logger.debug("e7=" + els.DETAILs["e7"] + " " + parseInt(els.DETAILs["e7"], 16));
		logger.debug("e8=" + els.DETAILs["e8"] + " " + parseInt(els.DETAILs["e8"], 16));

		for (var i = 0; i < global.get_properties.length; i++) {
			var prop = global.get_properties[i].toLowerCase();
			logger.debug(prop + " " + els.DETAILs[prop]);
			if (els.DETAILs[prop] != undefined) {
				global.result[prop] = els.DETAILs[prop];
			}
		}
	}
});

// NetworkのELをすべてsearchしてみよう．
// search ECHONET nodes in local network
// EL.search();

//EL.sendOPC1 = function( ip, seoj, deoj, esv, epc, edt)

if (!global.waifForAnswer) {
	global.waifForAnswer = true;

	// 問い合わせを送信。ただし、連続で送ると相手の負荷が怖いので1秒ずつ間を開ける
	global.result["datetime"] = new Date().toISOString();
	for (var i = 0; i < get_properties.length; i++) {
		setTimeout(function(prop) {
			logger.debug("send req " + prop);
			EL.sendOPC1('10.1.0.100', '05ff01', '028801', EL.GET, prop, "");
		},(i * 1000), global.get_properties[i]);
	}
}

setTimeout(function(sock) {
	global.power_logger.info(JSON.stringify(global.result));
	logger.debug("Exiting.");
	sock.close();
} , 15000, elsocket);
