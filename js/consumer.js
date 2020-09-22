import { NotImplementedError } from "yonius";

export class Consumer {
    async connect() {
        throw new NotImplementedError();
    }

    async consume(topic, callback) {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }
}
