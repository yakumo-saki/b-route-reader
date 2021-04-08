'use strict'

const TARGET_IP='10.1.0.105';

const CHECK_INTERVAL=2000          // 完了チェック間隔(ms)
const MAX_CHECK_COUNT=30           // タイムアウトまでのチェック回数
const DELAY_TO_FIRST_REQ=1000      // 最初のリクエストを投げるまでのウェイト

// モジュールの機能をELとして使う
// import functions as EL object
let EL = require('echonet-lite');
let EPC = require('./const-epc');
const log4js = require('log4js');

const SELF_DEV=EPC.DEV_CONTROLLER  // 自分（プログラム）自身のデバイス

/**
 * Echonet データを受信した際のコールバック
 * @param {*} rinfo 
 * @param {*} els 
 * @param {*} err 
 */
function echonetReceivedHandler( rinfo, els, err ) {

	let logger = global.logger;

	// GET(0x62) の応答 (0x72)
	if (els.DEOJ === SELF_DEV && els.ESV === EL.GET_RES) {
		logger.debug("===========");
		logger.debug("els.ESV=" + els.ESV);
		logger.debug("rinfo=" + JSON.stringify(rinfo) );
		logger.debug(els);
		logger.debug("===========");

		for (let i = 0; i < global.requestProperties.length; i++) {
			let prop = global.requestProperties[i].toLowerCase();
			// logger.debug(prop + " " + els.DETAILs[prop]);
			if (els.DETAILs[prop] != undefined) {
				global.result[prop] = els.DETAILs[prop];
			}
		}
	}
}

/**
 * すべてのデータが受信されたかチェック
 * @param {*} sock 
 * @returns 
 */
function doneWatcher(sock) {

  let done = true;

  // 全ての値が揃ったかチェック
  global.requestProperties.forEach(prop => {
    if (global.result[prop] == undefined) {
      // global.logger.debug("not done:" + prop);
      done = false;
    }
  });

  if (global.check_count < MAX_CHECK_COUNT) {

    if (!done) {
      global.check_count++;
      if (global.check_count >= 5 && (global.check_count % 3 == 0) ) {
        global.logger.debug("not done, continue checking " + global.check_count + "/" + MAX_CHECK_COUNT);
      }
      return;
    }

    // 値の解釈
    let e0 = parse_e0(global.result[EPC.DELTA_DENRYOKU], global.result[EPC.DELTA_UNIT]);
    let e2 = parse_e2(global.result[EPC.DELTA_HISTORY]);
    let e7 = parse_e7(global.result[EPC.NOW_DENRYOKU]);
    let e8 = parse_e8(global.result[EPC.NOW_DENRYUU]);

    global.result = Object.assign(global.result, e2, e0, e7, e8);

    logger.debug("done");
    global.power_logger.info(JSON.stringify(global.result));
    sock.close();
    clearInterval(global.done_watch);
    logger.info("Exiting.");
    process.on('exit', function(){process.exit(0);});
  } else {
    logger.debug("timeout. abort");
    sock.close();
    clearInterval(global.done_watch);
    logger.info("Exiting. (ABORT)");
    process.on('exit', function(){process.exit(4);});
  }

}

/**
 * 積算電力量(E2) の乗数を考慮しながら解釈
 * @param {*} delta_value
 * @param {*} e1_value
 * @return kWh
 * 0x00：1kWh
 * 0x01：0.1kWh
 * 0x02：0.01kWh
 * 0x03：0.001kWh
 * 0x04：0.0001kWh
 * 0x0A：10kWh
 * 0x0B：100kWh
 * 0x0C：1000kWh
 * 0x0D：10000kWh
 */
function parse_delta_kwh(delta_value, e1_value) {
  // 小数同士で乗算や除算をすると誤差が出る可能性があるので片方を整数にする
  if (e1_value == "00") {
    return delta_value;
  } else if (e1_value == "01") {
    return delta_value / 10;
  } else if (e1_value == "02") {
    return delta_value / 100;
  } else if (e1_value == "03") {
    return delta_value / 1000;
  } else if (e1_value == "04") {
    return delta_value / 10000;
  } else if (e1_value == "0A") {
    return delta_value * 10;
  } else if (e1_value == "0B") {
    return delta_value * 100;
  } else if (e1_value == "0C") {
    return delta_value * 1000;
  } else if (e1_value == "0D") {
    return delta_value * 10000;
  }

  throw "unknown unit " + e1_value;
}

/**
 * 積算電力量 kWh
 * @param {*} e2_value
 */
function parse_e2(e2_value) {
  if (e2_value == undefined) { return null}

	const e2_keys = ["0000","0030","0100","0130","0200","0230","0300","0330","0400","0430"
                  , "0500","0530","0600","0630","0700","0730","0800","0830","0900","0930"
                  , "1000","1030","1100","1130","1200","1230","1300","1330","1400","1430"
                  , "1500","1530","1600","1630","1700","1730","1800","1830","1900","1930"
                  , "2000","2030","2100","2130","2200","2230","2300","2330"]

  for (let i = 0; i < 48; i++) {
    let key = "history_kwh_" + e2_keys[i];
    if (e2_value != undefined) {
      let hex = e2_value.substr(4 + (i * 8), 8);
      global.result[key] = hex_to_decimal(hex);
    } else {
      global.result[key] = 0;
    }
  }
}

/**
 * loggerの初期化.
 * BUG: 初期化が終わる前に処理は先に行ってしまうので、ログ出力に失敗する可能性がある
 */
function initLogger() {
  let fs = require('fs');
  fs.readFile('./config/log4js.json', 'utf8', function (err, text) {
    let config = JSON.parse(text);
    // console.dir(config);
    log4js.configure(config);

    global.logger = log4js.getLogger('default');
    global.power_logger = log4js.getLogger('power');

    global.logger.info("Start ...");
  });
}

/**
 * e0 積算電力量計測値（正方向）
 */
function parse_e0(value, e1_value) {
  if (value == undefined || e1_value == undefined) { return null}

  return {delta_kwh: parse_delta_kwh(hex_to_decimal(value), e1_value) }
}

/**
 * e7 瞬時電力量計測値（正方向）
 */
function parse_e7(value) {
  if (value == undefined) { return null}

  return {now_w: hex_to_decimal(value)}
}

/**
 * e8 瞬時電流計測値（正方向）
 */
function parse_e8(value) {
  if (value == undefined) { return null}

  let r = hex_to_decimal(value.substr(0, 4));
  let t = hex_to_decimal(value.substr(4, 4));
  let div = 10;  // 0.1 A単位

  return {now_R_amp: (r / div), now_T_amp: (t / div), now_total_amp: ((r + t) / div) }
}

function hex_to_decimal(value) {
  return parseInt(value, 16);
}


/**
 * エントリポイント
 */
function main() {

  initLogger();

  const logger = log4js.getLogger('default');
  global.result = {};

  // 自分自身のオブジェクトを決める
  // set EOJ for this script
  // initializeで設定される，必ず何か設定しないといけない，今回はコントローラ
  // this EOJ list is required. '05ff01' is a controller.
  let objList = [EPC.DEV_CONTROLLER];
  let elsocket = EL.initialize( objList, echonetReceivedHandler, 4, {v4: '10.1.0.10'});

  global.waifForAnswer = false;
  global.requestProperties = [EPC.DELTA_UNIT, EPC.DELTA_DENRYOKU, EPC.NOW_DENRYOKU, EPC.NOW_DENRYUU];

  // 終了判定（適当過ぎるので後で直す）
  logger.debug("done watcher start.");
  global.check_count = 0;
  global.done_watch = setInterval(doneWatcher, CHECK_INTERVAL, elsocket);

  // 問い合わせを送信。ただし、連続で送ると相手の負荷が怖いので間を開ける
  global.result["datetime"] = new Date().toISOString();

  for (let i = 0; i < global.requestProperties.length; i++) {
    setTimeout(function(prop) {
      logger.debug("send req " + prop);

      //EL.sendOPC1 = function( ip, seoj, deoj, esv, epc, edt)
      EL.sendOPC1(TARGET_IP, EPC.DEV_CONTROLLER, EPC.DEV_METER, EL.GET, prop, "");
    },(i * 500 + DELAY_TO_FIRST_REQ), global.requestProperties[i]);
  }
}

main();