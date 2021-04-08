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

  let t = 0;
  if (value.substr(4, 4) == "7FFE") {
    t = 0; // 単相2線式なのでT相が存在しないので0
  } else {
    t = hex_to_decimal(value.substr(4, 4));
  }
  let div = 10;  // 0.1 A単位

  return {now_R_amp: (r / div), now_T_amp: (t / div), now_total_amp: ((r + t) / div) }
}

function hex_to_decimal(value) {
  return parseInt(value, 16);
}

module.exports = {
  "parse_e2": parse_e2,
  "parse_e0": parse_e0,
  "parse_e7": parse_e7,
  "parse_e8": parse_e8,
}
