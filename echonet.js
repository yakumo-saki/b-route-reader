'use strict'

// モジュールの機能をELとして使う
// import functions as EL object
var EL = require('echonet-lite');
var EPC = require('./const-epc');
const log4js = require('log4js');

var fs = require('fs');
fs.readFile('./config/log4js.json', 'utf8', function (err, text) {
  var config = JSON.parse(text);
  console.dir(config);
  log4js.configure(config);
});

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

	// GET(0x62) の応答 (0x72)
	if (els.DEOJ === '05ff01' && els.ESV === EL.GET_RES) {
		// logger.debug(els.ESV);
		// logger.debug("=---------=");
		// logger.debug(rinfo);
		// logger.debug("=---------=");
		// logger.debug(els);
		// logger.debug("=---------=");
		// logger.debug(els.DETAILs);
		// logger.debug("e0=" + els.DETAILs["e0"] + " " + parseInt(els.DETAILs["e0"], 16));
		// logger.debug("e7=" + els.DETAILs["e7"] + " " + parseInt(els.DETAILs["e7"], 16));
		// logger.debug("e8=" + els.DETAILs["e8"] + " " + parseInt(els.DETAILs["e8"], 16));

		for (var i = 0; i < global.get_properties.length; i++) {
			var prop = global.get_properties[i].toLowerCase();
			// logger.debug(prop + " " + els.DETAILs[prop]);
			if (els.DETAILs[prop] != undefined) {
				global.result[prop] = els.DETAILs[prop];
			}
		}
	}
});


// 問い合わせを送信。ただし、連続で送ると相手の負荷が怖いので1秒ずつ間を開ける
global.result["datetime"] = new Date().toISOString();

for (var i = 0; i < get_properties.length; i++) {
	setTimeout(function(prop) {
		logger.debug("send req " + prop);

		//EL.sendOPC1 = function( ip, seoj, deoj, esv, epc, edt)
		EL.sendOPC1('10.1.0.100', '05ff01', '028801', EL.GET, prop, "");
	},(i * 1000), global.get_properties[i]);
}


// 終了判定（適当過ぎるので後で直す）
global.done_watch = setInterval(function(sock) {

  var done = true;

  // 全ての値が揃ったかチェック
  get_properties.forEach(prop => {
    if (global.result[prop] == undefined) {
      done = false;
    }
  });

  if (!done) {
    return;
  }

	// 値の解釈
  var e0 = parse_e0(global.result[EPC.DELTA_DENRYOKU]);
  var e2 = parse_e2(global.result[EPC.DELTA_HISTORY]);
  var e7 = parse_e7(global.result[EPC.NOW_DENRYOKU]);
  var e8 = parse_e8(global.result[EPC.NOW_DENRYUU]);

  global.result = Object.assign(global.result, e2, e0, e7, e8);

	global.power_logger.info(JSON.stringify(global.result));
	logger.debug("Exiting.");
  sock.close();
  clearInterval(global.done_watch);
} , 1000, elsocket);

/**
 * 積算電力量 kWh
 * @param {*} e2_value
 */
function parse_e2(e2_value) {

	const e2_keys = ["0000","0030","0100","0130","0200","0230","0300","0330","0400","0430"
                  , "0500","0530","0600","0630","0700","0730","0800","0830","0900","0930"
                  , "1000","1030","1100","1130","1200","1230","1300","1330","1400","1430"
                  , "1500","1530","1600","1630","1700","1730","1800","1830","1900","1930"
                  , "2000","2030","2100","2130","2200","2230","2300","2330"]

  for (var i = 0; i < 48; i++) {
    var key = "history_kwh_" + e2_keys[i];
    if (e2_value != undefined) {
      var hex = e2_value.substr(4 + (i * 8), 8);
      global.result[key] = hex_to_decimal(hex);
    } else {
      global.result[key] = 0;
    }
  }
}

/**
 * e0 積算電力量計測値（正方向）
 */
function parse_e0(value) {
  return {delta_kwh: hex_to_decimal(value)}
}

/**
 * e7 瞬時電力量計測値（正方向）
 */
function parse_e7(value) {
  return {now_w: hex_to_decimal(value)}
}

/**
 * e8 瞬時電流計測値（正方向）
 */
function parse_e8(value) {
  var r = hex_to_decimal(value.substr(0, 4));
  var t = hex_to_decimal(value.substr(4, 4));
  var div = 10;  // 0.1 A単位

  return {now_R_amp: (r / div), now_T_amp: (t / div), now_total_amp: ((r + t) / div) }
}

function hex_to_decimal(value) {
  return parseInt(value, 16);
}
