#!/bin/bash -eu

cd /opt/scripts/b-route-reader
node echonet.js

# zabbix
tail -n 1 /var/log/environment/powerdata.log > /opt/scripts/zabbix/externalscripts/environment/lastpower.json

cd /opt/scripts/zabbix/externalscripts/environment
./b-route-power.sh
