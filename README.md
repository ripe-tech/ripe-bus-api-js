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

The producer can send one or more events:

```javascript
bus.trigger("order.created", { id: 1, ... });

bus.trigger("order.created_multiple", [{ id: 1, ... }, { id: 2, ... }]);
```

The topic defaults to the first part of the name (separated with '.'). The example below defaults to the `order` topic and the event name is `order.created`:

```javascript
bus.trigger("order.created", { id: 1, ... });
```

The third parameter allows to pass other options to configure event trigger operation. Additional event metadata is added by the API but you can explicitly set it as follows (using options):

```javascript
bus.trigger("order.created", { id: 1, ... }, {
    topic: "ripe_core.order",
    origin: "ripe-core",
    hostname: "ripe-core.now.platforme.com",
    timestamp: 16007020
});
```

### Consumer

The consumer listens for a topic and executes a callback. The second parameter allows for a callback function or an object containing the callback and other options. The second parameter also allows for callbacks for `onSuccess` and `onError` functions if the `KafkaRetry` consumer is used. It also receives a list of `events` of interest: any event with a different name is ignored.

```javascript
bus.bind("order", message => { ... });

bus.bind("order", {
    events: ["order.created", "order.sent", "order.ready"],
    callback: message => { ... }
});

bus.bind("order", {
    events: "order.created",
    callback: message => { ... },
    onSuccess: message => { ... },
    onError: message => { ... },
    retries: 5
});
```

It is also possible to bind to multiple topics in a single call:

```javascript
bus.bind(["order", "ripe_twitch:order"], message => { ... });
```

## Configuration

| Name                                     | Type  | Default            | Description                                                                                                                                      |
| ---------------------------------------- | ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BUS_ADAPTER**                          | `str` | `kafka`            | The name of the bus adapter adapter to be used (eg: `kafka`, `kafkaRetry`).                                                                      |
| **KAFKA_HOSTS**                          | `str` | `localhost:9092`   | The hostname and port of the Kafka nodes to be used, separated by a `,` (comma).                                                                 |
| **KAFKA_CLIENT_ID**                      | `str` | `ripe-kafka`       | Kafka client ID, uniquely identifies a connection to a Kafka broker (more [here](https://kafka.js.org/docs/1.13.0/configuration)).               |
| **KAFKA_CONSUMER_GROUP_ID**              | `str` | `${RANDOM_STRING}` | Kafka consumer group ID, identifies a consumer and is unique for a given Kafka broker (more [here](https://kafka.js.org/docs/1.13.0/consuming)). |
| **KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR** | `str` | `data`             | Kafka consumer persistent directory that will store files for message retries.                                                                   |
| **KAFKA_RETRIES**                        | `int` | `5`                | Kafka max number of retries to be used in the sending of a message.                                                                              |

For more details and up-to-date information on Kafka specific configs check the [Kafka official documentation](https://kafka.apache.org/documentation/#configuration).

## License

RIPE Bus API (for Javascript) is currently licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/).

## Build Automation

[![Build Status](https://app.travis-ci.com/ripe-tech/ripe-bus-api-js.svg?branch=master)](https://travis-ci.com/github/ripe-tech/ripe-bus-api-js)
[![Build Status GitHub](https://github.com/ripe-tech/ripe-bus-api-js/workflows/Main%20Workflow/badge.svg)](https://github.com/ripe-tech/ripe-bus-api-js/actions)
[![npm Status](https://img.shields.io/npm/v/ripe-bus-api.svg)](https://www.npmjs.com/package/ripe-bus-api)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://www.apache.org/licenses/)
