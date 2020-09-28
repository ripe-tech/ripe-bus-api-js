# RIPE Bus API (for Javascript)

The Javascript API for the RIPE event bus.

Should be able to provide an easy-to-use API to be used by microservices of the PERI family.

## Initialization

```javascript
import { API as RipeBusAPI } from "ripe-bus-api-js";

await RipeBusAPI.load();
const bus = new RipeBusAPI();
```

## Usage

### Producer

The producer can send one or more messages to a specific topic. The third parameter allows to pass other options to configure the Bus client used.

```javascript
bus.trigger("order", { id: 1, ... });

bus.trigger("order", [{ id: 1, ... }, { id: 2, ... }]);

bus.trigger("order", { id: 1, ... }, { kafkaHosts: "localhost:9091" });
```

### Consumer

The consumer listens for a topic/event and executes a callback. The second parameter allows for a callback function or an object containing the callback and other options. The second parameter also allows for callbacks for `onSuccess` and `onError` functions if the `KafkaRetry` consumer is used.

```javascript
bus.bind("order", (message) => { ... });

bus.bind("order", {
    callback: (message) => { ... }
});

bus.bind("order", {
    callback: (message) => { ... },
    onSuccess: (message) => { ... },
    onError: (message) => { ... },
    retries: 5
});
```

## License

RIPE Bus API (for Javascript) is currently licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/).

## Build Automation

[![Build Status](https://travis-ci.org/ripe-tech/ripe-bus-api-js.svg?branch=master)](https://travis-ci.org/ripe-tech/ripe-bus-api-js)
[![Build Status GitHub](https://github.com/ripe-tech/ripe-bus-api-js/workflows/Main%20Workflow/badge.svg)](https://github.com/ripe-tech/ripe-bus-api-js/actions)
[![npm Status](https://img.shields.io/npm/v/ripe-bus-api.svg)](https://www.npmjs.com/package/ripe-bus-api)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/)
