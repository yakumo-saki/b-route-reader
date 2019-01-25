'use strict'

const TARGET_IP='10.1.0.100'

// モジュールの機能をELとして使う
// import functions as EL object
var EL = require('echonet-lite');
var EPC = require('./const-epc');
const log4js = require('log4js');

const SELF_DEV=EPC.DEV_CONTROLLER  // 自分（プログラム）自身のデバイス

var fs = require('fs');
fs.readFile('./config/log4js.json', 'utf8', function (err, text) {
  var config = JSON.parse(text);
  // console.dir(config);
  log4js.configure(config);
});

global.logger = log4js.getLogger('default');
const logger = global.logger;

global.power_logger = log4js.getLogger('power');

global.result = {};

// 自分自身のオブジェクトを決める
// set EOJ for this script
// initializeで設定される，必ず何か設定しないといけない，今回はコントローラ
// this EOJ list is required. '05ff01' is a controller.
var objList = [EPC.DEV_CONTROLLER];

global.waifForAnswer = false;
global.get_properties = [EPC.DELTA_DENRYOKU, EPC.NOW_DENRYOKU, EPC.NOW_DENRYUU, EPC.DELTA_HISTORY];

////////////////////////////////////////////////////////////////////////////
// 初期化するとともに，受信動作をコールバックで登録する
// initialize and setting callback. the callback is called by reseived packet.
var elsocket = EL.initialize( objList, function( rinfo, els, err ) {

	var logger = global.logger;

	// GET(0x62) の応答 (0x72)
	if (els.DEOJ === SELF_DEV && els.ESV === EL.GET_RES) {
		logger.debug("===========");
		logger.debug("els.ESV=" + els.ESV);
		logger.debug("rinfo=" + JSON.stringify(rinfo) );
		logger.debug(els);
		logger.debug("===========");
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

	logger.debug("done");
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

// 問い合わせを送信。ただし、連続で送ると相手の負荷が怖いので間を開ける
global.result["datetime"] = new Date().toISOString();

for (var i = 0; i < get_properties.length; i++) {
	setTimeout(function(prop) {
		logger.debug("send req " + prop);

		//EL.sendOPC1 = function( ip, seoj, deoj, esv, epc, edt)
		EL.sendOPC1(TARGET_IP, EPC.DEV_CONTROLLER, EPC.DEV_METER, EL.GET, prop, "");
	},(i * 500 + 500), global.get_properties[i]);
}
