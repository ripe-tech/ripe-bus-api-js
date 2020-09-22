# RIPE Bus API for Javascript

The Javascript API for the RIPE Bus.

## Initialization 

```javascript
import { API as RipeBusAPI } from "ripe-bus-api-js";

await RipeBusAPI.load();
const bus = new RipeBusAPI();
```

## Usage

```javascript
bus.bind("order", (message) => { ... })

bus.trigger("order", { order: { ... }})
```
