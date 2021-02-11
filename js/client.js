import { NotImplementedError } from "yonius";

export class Client {
    static async getInstance(force = false) {
        if (!force && this._instance) return this._instance;
        this._instance = await this.build();
        return this._instance;
    }

    static async build(options = {}) {
        throw new NotImplementedError();
    }

    get client() {
        throw new NotImplementedError();
    }

    async getTopics() {
        throw new NotImplementedError();
    }
}
