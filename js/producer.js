import { NotImplementedError } from "yonius";

export class Producer {
    async connect() {
        throw new NotImplementedError();
    }

    async produce(topic, message, options = {}) {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }
}
