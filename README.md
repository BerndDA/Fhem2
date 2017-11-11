# homebridge-fhem2
This is an example plugin for homebridge. It is used for bridging FHEM devices to homebridge using a platform shim.

# Quick Start
 * install using npm install -g
 * adapt config.json of homebridge
 * add custom-attribute "homebridgeType" to FHEM
 * set the new attribute type accordingly

**Note:** More extensive documentation in the works... 

# Edit config.json
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
# HombridgeTypes
### FhemSwitch, FhemOutlet, FhemLightbulb
support switching with STATE on|off
### FhemMotionSensor, FhemContactSensor
every device reporting status with STATE on|off
### FhemThermostat
support for PWMR type
### WindowCovering
support for Eltako enocean actors