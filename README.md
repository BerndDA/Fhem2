# homebridge-fhem2
This is an example plugin for homebridge. It is used for bridging FHEM devices to homebridge using a platform shim.

On start a webhook via notify is added to FHEM that sends relevant events to the plugin. Please make sure port 2000 can be accessed from FHEM to your homebridge installation.

## Quick Start
 * install using npm install -g
 * adapt config.json of homebridge
 * add custom-attribute "homebridgeType" to FHEM
 * set the new attribute type accordingly for the devices you wish to show up.

More extensive documentation in the works... 

## Edit config.json
```javascript
"platforms": [
    {
      "platform": "Fhem2",
      "name": "Fhem2",
      "server": "192.168.178.25",
      "port": 8084,
      "ssl": false,
      "auth": {
        "user": "fhem",
        "pass": "fhempassword"
      }
    }
  ]
```
***note:*** Authentication (auth) currently not supported
## HombridgeTypes
### switch, outlet, lightbulb
support switching with STATE on|off
### motionsensor, contactsensor
any device reporting status with STATE on|off
### heating, heatingEQ3
support for PWMR type and Equiva EQ3 BLE
### windowcovering, updownswitch
support for Eltako enocean actors and generic coverings with up|down commands (shown as 2 switches in homekit)
### temperaturesensor, temperaturehumiditysensor
sonsors reporting temperature or temperature and humidity
### lametricremote
remote control for lametric
### progswitch
programmable enocean wall switch