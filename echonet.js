'use strict'

// const TARGET_IP='10.1.0.105';

const CHECK_INTERVAL=2000          // 完了チェック間隔(ms)
const MAX_CHECK_COUNT=30           // タイムアウトまでのチェック回数
const DELAY_TO_FIRST_REQ=1000      // 最初のリクエストを投げるまでのウェイト

// モジュールの機能をELとして使う
// import functions as EL object
const log4js = require('log4js');
let EL = require('echonet-lite');
let EPC = require('./const-epc');
const echonetHelper = require('./echonet-helper');

const SELF_DEV=EPC.DEV_CONTROLLER  // 自分（プログラム）自身のデバイス

/**
 * Echonet データを受信した際のコールバック
 * 検索であろうと何であろうとすべてここに来てしまうので注意
 * @param {*} rinfo
 * @param {*} els
 * @param {*} err
 */
function echonetReceivedHandler( rinfo, els, err ) {

	let logger = global.logger;

  // logger.debug(els);

	// GET(0x62) の応答 (0x72)
	if (els.DEOJ === SELF_DEV && els.ESV === EL.GET_RES) {
		global.debug("===========");
		global.debug("els.ESV=" + els.ESV);
		global.debug("rinfo=" + JSON.stringify(rinfo) );
		global.debug(els);
		global.debug("===========");

		for (let i = 0; i < global.requestProperties.length; i++) {
			let prop = global.requestProperties[i].toLowerCase();
			global.debug(prop + " " + els.DETAILs[prop]);
			if (els.DETAILs[prop] != undefined) {
				global.result[prop] = els.DETAILs[prop];
			}
		}
	}
}

/**
 * プログラムの終了を監視する。rejectはしない
 * @returns
 */
function exitWaiter() {
  return new Promise(async (resolve, reject) => {
    let endWait = false;
    while (!endWait) {
      global.debug("Check ExitFlag");
      if (global.condition.exitFlag) {
        process.on('exit', function() {
          process.exit(global.condition.exitcode)
        });

        if (global.condition.exitcode != 0) {
          global.logger.warn("Exitcode: " + global.condition.exitcode);
        }

        // if (global.ELsocket != undefined) {
        //   global.ELsocket.close();
        // }
        global.debug("exitWaiter exit.");
        resolve();
        endWait = true;
        EL = undefined;
      }

      await wait(1000);
    }
    process.exit();
  });
}

/**
 * すべてのデータが受信されたかチェック
 * @returns
 */
function doneWatcher() {
  global.debug("doneWatcher");
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
      // まだ完了していない
      global.check_count++;
      if (global.check_count >= 5 && (global.check_count % 3 == 0) ) {
        global.logger.debug("not done, continue checking " + global.check_count + "/" + MAX_CHECK_COUNT);
      }
      setTimeout(doneWatcher, CHECK_INTERVAL);
      return;
    }

    // 値の解釈
    let e0 = echonetHelper.parse_e0(global.result[EPC.DELTA_DENRYOKU], global.result[EPC.DELTA_UNIT]);
    let e2 = echonetHelper.parse_e2(global.result[EPC.DELTA_HISTORY]);
    let e7 = echonetHelper.parse_e7(global.result[EPC.NOW_DENRYOKU]);
    let e8 = echonetHelper.parse_e8(global.result[EPC.NOW_DENRYUU]);

    global.result = Object.assign(global.result, e2, e0, e7, e8);

    global.power_logger.info(JSON.stringify(global.result));
    global.logger.info("Normal end.");

    global.condition.exitcode = 0;
    global.condition.exitFlag = true;
    global.debug("doneWaiter exit.");
    return;
  } else {
    global.logger.error("Abend.");
    global.condition.exitcode = 4;
    global.condition.exitFlag = true;
    global.debug("doneWaiter exit.");
    return;
  }

}

/**
 * loggerの初期化.
 * @async
 */
function initLogger() {
  return new Promise((resolve, reject) => {
    let fs = require('fs');
    fs.readFile('./config/log4js.json', 'utf8', function (err, text) {
      let config = JSON.parse(text);
      // console.dir(config);
      log4js.configure(config);

      global.logger = log4js.getLogger('default');
      global.power_logger = log4js.getLogger('power');
      global.debugLogger = log4js.getLogger('debug');
      global.debug = function(output) {global.debugLogger.debug(output)};

      global.logger.info("Start");
      resolve();
    });
  });
}

/**
 *
 * @async
 * @param {*} millisecond
 * @returns
 */
function wait(millisecond) {
  return new Promise((resolve) => {
      setTimeout(() => { resolve()}, millisecond);
    });
}

/**
 * EL.search() -> EL.facilities 内にスマートメータークラス 028801 が発見
 * されるまで待つ。
 * @async
 * @returns Promise<String> IPアドレス
 */
function waitForMeterFound() {
  global.logger.info("Looking for smartmeter");
  EL.search(); // 自動的に検索させる

  return new Promise(async (resolve, reject) => {
    // global.logger.info("REJECT");
    // reject("aaaa");
    // return;
    for (let waitIdx = 0; waitIdx < 4; waitIdx++) {
      await wait(5000);
      // console.log("Check EL.facilities");
      for (let ip in EL.facilities) {
        // console.log("found facilities");
        // console.log("IP=" + ip);
        for (let fac in EL.facilities[ip]) {
          // console.log("FAC=" + fac);
          if (fac === EPC.DEV_METER) {
            global.logger.info("Found smartmeter: " + ip);
            resolve(ip);
            return;
          }
        }
      }
    }
    global.logger.error("Smartmeter not found.");
    reject("SmartMeter Not found within time.");
});

}

async function sendQuery(ip) {

  // 問い合わせを送信。ただし、連続で送ると相手の負荷が怖いので間を開ける
  for (let i = 0; i < global.requestProperties.length; i++) {
    setTimeout(function(prop) {
      logger.debug("Send data request " + prop);

      //EL.sendOPC1 = function( ip, seoj, deoj, esv, epc, edt)
      EL.sendOPC1(ip, EPC.DEV_CONTROLLER, EPC.DEV_METER, EL.GET, prop, "");
    },(i * 100 + DELAY_TO_FIRST_REQ), global.requestProperties[i]);
  }
}

/**
 * エントリポイント
 */
 (async function() {

  await initLogger();

  global.requestProperties = [EPC.DELTA_UNIT, EPC.DELTA_DENRYOKU, EPC.NOW_DENRYOKU, EPC.NOW_DENRYUU];
  global.condition = {exitcode: 0, exitFlag: false};
  global.logger = log4js.getLogger('default');
  global.result = {};
  global.result["datetime"] = new Date().toISOString();

  // Echonet 通信に使うNICを特定
  EL.renewNICList();
  let nic;
  if (EL.nicList.v4.length > 0) {
    nic = EL.nicList.v4[0];
    // global.logger.info(`Using network: ${nic.name} ${nic.address}`);
  } else {
    global.logger.error("Network interface not found");
    process.exit(16);
  }

  // echonet-lite 初期化
  let objList = [EPC.DEV_CONTROLLER];
  EL.initialize( objList, echonetReceivedHandler, 4, {v4: nic.address, autoGetProperties: true});
  global.logger.info(`Using network ${EL.usingIF.v4}`);

  try {
    let ip = await waitForMeterFound();

    // 受信完了判定スレッドスタート
    global.logger.info("Data receive watcher start");
    global.check_count = 0;
    setTimeout(doneWatcher, CHECK_INTERVAL);

    sendQuery(ip);
    global.logger.info("Request sent. wait for response");

  } catch (error) {
    global.logger.error("ERROR: " + error);
    global.condition.exitcode = 16;
    global.condition.exitFlag = true;
  }

  // 終了監視スレッドスタート
  await exitWaiter();

}());
