/**
 * Ripe Bus API (for Javascript) 0.5.0.
 *
 * Copyright (c) 2014-2025 Platforme International.
 *
 * This source code is licensed under the Apache 2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import process, { env } from 'process';
import * as fs from 'fs';
import { join, normalize, resolve, dirname } from 'path';
import 'node-fetch';
import { CompressionTypes, Kafka } from 'kafkajs';

var global$1 = (typeof global !== "undefined" ? global :
  typeof self !== "undefined" ? self :
  typeof window !== "undefined" ? window : {});

let HOME_DIR = null;

const pathExists = async function(path) {
    try {
        await fs.promises.access(path);
    } catch (error) {
        return false;
    }
    return true;
};

const expandUser = function(path) {
    if (!path) return path;
    if (path === "~") return _homeDir();
    if (path.slice(0, 2) !== "~/") return path;
    return join(HOME_DIR, path.slice(2));
};

const getEnv = function(name) {
    // eslint-disable-next-line no-undef
    if (typeof Deno !== "undefined") return Deno.env.get(name);
    return env[name];
};

const getEnvObject = function() {
    // eslint-disable-next-line no-undef
    if (typeof Deno !== "undefined") return Deno.env.toObject();
    return env;
};

const _homeDir = function() {
    if (HOME_DIR !== null) return HOME_DIR;
    const isWindows = Boolean(typeof process !== "undefined" && process.platform === "win32");
    HOME_DIR = getEnv(isWindows ? "USERPROFILE" : "HOME") || "/";
    return HOME_DIR;
};

const FILE_NAME = "yonius.json";

const HOME_FILE = "~/.home";

const IMPORT_NAMES = ["$import", "$include", "$IMPORT", "$INCLUDE"];

const CASTS = {
    int: v => (typeof v === "number" ? v : parseInt(v)),
    float: v => (typeof v === "number" ? v : parseFloat(v)),
    bool: v => (typeof v === "boolean" ? v : ["1", "true", "True"].includes(v)),
    list: v => (Array.isArray(v) ? v : v.split(";")),
    tuple: v => (Array.isArray(v) ? v : v.split(";"))
};

const globals =
    typeof global$1 === "undefined"
        ? typeof window === "undefined"
            ? typeof self === "undefined"
                ? {}
                : self
            : window
        : global$1;

globals.CONFIGS = globals.CONFIGS === undefined ? {} : globals.CONFIGS;

globals.CONFIG_F = globals.CONFIG_F === undefined ? [] : globals.CONFIG_F;

globals.HOMES = globals.HOMES === undefined ? [] : globals.HOMES;

globals.LOADED = globals.LOADED === undefined ? false : globals.LOADED;

const conf = function(name, fallback = undefined, cast = null, ctx = null) {
    const configs = ctx ? ctx.configs : globals.CONFIGS;
    cast = _castR(cast);
    let value = configs[name] === undefined ? fallback : configs[name];
    if (cast && value !== undefined && value !== null) value = cast(value);
    return value;
};

const load$1 = async function(
    names = [FILE_NAME],
    path = null,
    encoding = "utf-8",
    force = false,
    ctx = null
) {
    if (globals.LOADED && !force) return;
    let paths = [];
    const homes = await getHomes();
    for (const home of homes) {
        paths = paths.concat([join(home), join(home, ".config")]);
    }
    paths.push(path);
    for (const path of paths) {
        for (const name of names) {
            await loadFile(name, path, encoding, ctx);
        }
    }
    await loadEnv(ctx);
    globals.LOADED = true;
};

const loadFile = async function(
    name = FILE_NAME,
    path = null,
    encoding = "utf-8",
    ctx = null
) {
    const configs = ctx ? ctx.configs : globals.CONFIGS;
    const configF = ctx ? ctx.configF : globals.CONFIG_F;

    let key;
    let value;
    let exists;
    let filePath;

    if (path) path = normalize(path);
    if (path) filePath = join(path, name);
    else filePath = name;

    filePath = resolve(filePath);
    filePath = normalize(filePath);
    const basePath = dirname(filePath);

    exists = await pathExists(filePath);
    if (!exists) return;

    exists = configF.includes(filePath);
    if (exists) configF.splice(configF.indexOf(filePath), 1);
    configF.push(filePath);

    const data = await fs.promises.readFile(filePath, { encoding: encoding });
    const dataJ = JSON.parse(data);

    await _loadIncludes(basePath, dataJ, encoding);

    for ([key, value] of Object.entries(dataJ)) {
        if (!_isValid(key)) continue;
        configs[key] = value;
    }
};

const loadEnv = async function(ctx = null) {
    const env = getEnvObject();
    const configs = ctx ? ctx.configs : globals.CONFIGS;
    if (env === undefined || env === null) return;
    Object.entries(env).forEach(function([key, value]) {
        configs[key] = value;
    });
};

const getHomes = async function(
    filePath = HOME_FILE,
    fallback = "~",
    encoding = "utf-8",
    forceDefault = false
) {
    if (globals.HOMES.length > 0) return globals.HOMES;

    const env = getEnvObject();

    globals.HOMES = env.HOMES === undefined ? null : env.HOMES;
    globals.HOMES = globals.HOMES ? globals.HOMES.split(";") : globals.HOMES;
    if (globals.HOMES !== null) return globals.HOMES;

    fallback = expandUser(fallback);
    fallback = normalize(fallback);
    globals.HOMES = [fallback];

    filePath = expandUser(filePath);
    filePath = normalize(filePath);
    const exists = await pathExists(filePath);
    if (!exists) return globals.HOMES;

    if (!forceDefault) globals.HOMES.splice(0, globals.HOMES.length);

    let data = await fs.promises.readFile(filePath, { encoding: encoding });
    data = data.trim();

    let paths = data.split(/\r?\n/);
    paths = paths.map(v => v.trim());

    for (let path of paths) {
        path = path.trim();
        if (!path) continue;
        path = expandUser(path);
        path = normalize(path);
        globals.HOMES.push(path);
    }

    return globals.HOMES;
};

const _castR = function(cast) {
    return CASTS[cast] === undefined ? cast : CASTS[cast];
};

const _loadIncludes = async function(basePath, config, encoding = "utf-8") {
    let includes = [];

    for (const alias of IMPORT_NAMES) {
        includes = config[alias] === undefined ? includes : config[alias];
    }

    if (typeof includes === "string") {
        includes = includes.split(";");
    }

    for (const include of includes) {
        await loadFile(include, basePath, encoding);
    }
};

const _isValid = function(key) {
    if (IMPORT_NAMES.includes(key)) return false;
    return true;
};

class YoniusError extends Error {
    constructor(message, code = 500) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
    }

    get isClient() {
        return Math.floor(this.code / 100) === 4;
    }

    get isServer() {
        return Math.floor(this.code / 100) === 5;
    }
}

class OperationalError extends YoniusError {
    constructor(message = "Operational error", code = 500) {
        super(message, code);
    }
}

class NotImplementedError extends OperationalError {
    constructor(message = "Not implemented", code = 501) {
        super(message, code);
    }
}

const buildGetAgent = (AgentHttp, AgentHttps, set = true, options = {}) => {
    const httpAgent = new AgentHttp({
        keepAlive: options.keepAlive === undefined ? true : options.keepAlive,
        keepAliveMsecs: options.keepAliveMsecs || 120000,
        timeout: options.timeout || 60000,
        scheduling: options.scheduling || "fifo"
    });
    const httpsAgent = new AgentHttps({
        keepAlive: options.keepAlive === undefined ? true : options.keepAlive,
        keepAliveMsecs: options.keepAliveMsecs || 120000,
        timeout: options.timeout || 60000,
        scheduling: options.scheduling || "fifo"
    });
    const getAgent = parsedURL => (parsedURL.protocol === "http:" ? httpAgent : httpsAgent);
    if (set) globals.getAgent = getAgent;
    return getAgent;
};

/**
 * Tries to patch the global environment with a proper `getAgent`
 * function that can handle HTTP and HTTP connection polling.
 *
 * This can only be performed in a node.js environment (uses `require`).
 *
 * @returns {Function} The `getAgent` function that has just been
 * built and set in the globals.
 */
const patchAgent = () => {
    if (typeof require !== "function") return;
    if (globals.getAgent) return;
    let http, https;
    try {
        http = require("http");
        https = require("https");
    } catch (err) {
        return;
    }
    if (!http || !https) return;
    if (!http.Agent || !https.Agent) return;
    return buildGetAgent(http.Agent, https.Agent, true);
};

// patches the global agent if possible, using the
// global dynamic require statements
patchAgent();

const load = async function() {
    await load$1();
};

class Client {
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
}

class KafkaClient extends Client {
    static async build(options = {}) {
        const instance = new this();
        await instance.init(options);
        return instance;
    }

    /**
     * Maps the string representation of a compression type to
     * a KafkaJS compatible compression type.
     *
     * @param {String} compression The compression value represented as a string.
     * @returns {Number} The KafkaJS compression type.
     */
    static convertCompression(compression) {
        switch (compression) {
            case "gzip":
                return CompressionTypes.GZIP;
            default:
                return CompressionTypes.None;
        }
    }

    /**
     * Sanitizes a topic name to match Kafka's topic naming
     * rules.
     *
     * @param {String} topic The name of the topic to be sanitized.
     * @returns {String} The sanitized topic name.
     */
    static sanitizeTopic(topic) {
        const illegalChars = /[^a-zA-Z0-9\\._\\-]/g;
        return topic.replace(illegalChars, "-");
    }

    async init(options = {}) {
        let hosts = conf("KAFKA_HOSTS", "localhost:9092");
        let clientId = conf("KAFKA_CLIENT_ID", "ripe-kafka");
        let connectionTimeout = conf("KAFKA_CONNECT_TIMEOUT", 10000);
        let requestTimeout = conf("KAFKA_REQUEST_TIMEOUT", 30000);
        let initialRetryTime = conf("KAFKA_INITIAL_RETRY_TIME", 300);
        let maxRetryTime = conf("KAFKA_MAX_RETRY_TIME", 30000);
        let retries = conf("KAFKA_RETRIES", 5);

        hosts = options.hosts === undefined ? hosts : options.hosts;
        clientId = options.clientId === undefined ? clientId : options.clientId;
        connectionTimeout =
            options.connectionTimeout === undefined ? connectionTimeout : options.connectionTimeout;
        requestTimeout =
            options.requestTimeout === undefined ? requestTimeout : options.requestTimeout;
        initialRetryTime =
            options.initialRetryTime === undefined ? initialRetryTime : options.initialRetryTime;
        maxRetryTime = options.maxRetryTime === undefined ? maxRetryTime : options.maxRetryTime;
        retries = options.retries === undefined ? retries : options.retries;

        this._client = new Kafka({
            brokers: hosts.split(","),
            clientId: clientId,
            connectionTimeout: connectionTimeout,
            requestTimeout: requestTimeout,
            retry: {
                initialRetryTime: initialRetryTime,
                maxRetryTime: maxRetryTime,
                retries: retries
            }
        });
    }

    get client() {
        return this._client;
    }
}

// Unique ID creation requires a high quality random # generator. In the browser we therefore
// require the crypto API and do not support built-in fallback to lower quality random number
// generators (like Math.random()).
var getRandomValues;
var rnds8 = new Uint8Array(16);
function rng() {
  // lazy load so that environments that need to polyfill have a chance to do so
  if (!getRandomValues) {
    // getRandomValues needs to be invoked in a context where "this" is a Crypto implementation. Also,
    // find the complete implementation of crypto (msCrypto) on IE11.
    getRandomValues = typeof crypto !== 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto) || typeof msCrypto !== 'undefined' && typeof msCrypto.getRandomValues === 'function' && msCrypto.getRandomValues.bind(msCrypto);

    if (!getRandomValues) {
      throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
    }
  }

  return getRandomValues(rnds8);
}

var REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000)$/i;

function validate(uuid) {
  return typeof uuid === 'string' && REGEX.test(uuid);
}

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */

var byteToHex = [];

for (var i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).substr(1));
}

function stringify(arr) {
  var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  // Note: Be careful editing this code!  It's been tuned for performance
  // and works in ways you may not expect. See https://github.com/uuidjs/uuid/pull/434
  var uuid = (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + '-' + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + '-' + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + '-' + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + '-' + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase(); // Consistency check for valid UUID.  If this throws, it's likely due to one
  // of the following:
  // - One or more input array values don't map to a hex octet (leading to
  // "undefined" in the uuid)
  // - Invalid input values for the RFC `version` or `variant` fields

  if (!validate(uuid)) {
    throw TypeError('Stringified UUID is invalid');
  }

  return uuid;
}

function parse(uuid) {
  if (!validate(uuid)) {
    throw TypeError('Invalid UUID');
  }

  var v;
  var arr = new Uint8Array(16); // Parse ########-....-....-....-............

  arr[0] = (v = parseInt(uuid.slice(0, 8), 16)) >>> 24;
  arr[1] = v >>> 16 & 0xff;
  arr[2] = v >>> 8 & 0xff;
  arr[3] = v & 0xff; // Parse ........-####-....-....-............

  arr[4] = (v = parseInt(uuid.slice(9, 13), 16)) >>> 8;
  arr[5] = v & 0xff; // Parse ........-....-####-....-............

  arr[6] = (v = parseInt(uuid.slice(14, 18), 16)) >>> 8;
  arr[7] = v & 0xff; // Parse ........-....-....-####-............

  arr[8] = (v = parseInt(uuid.slice(19, 23), 16)) >>> 8;
  arr[9] = v & 0xff; // Parse ........-....-....-....-############
  // (Use "/" to avoid 32-bit truncation when bit-shifting high-order bytes)

  arr[10] = (v = parseInt(uuid.slice(24, 36), 16)) / 0x10000000000 & 0xff;
  arr[11] = v / 0x100000000 & 0xff;
  arr[12] = v >>> 24 & 0xff;
  arr[13] = v >>> 16 & 0xff;
  arr[14] = v >>> 8 & 0xff;
  arr[15] = v & 0xff;
  return arr;
}

function stringToBytes(str) {
  str = unescape(encodeURIComponent(str)); // UTF8 escape

  var bytes = [];

  for (var i = 0; i < str.length; ++i) {
    bytes.push(str.charCodeAt(i));
  }

  return bytes;
}

var DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
var URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
function v35 (name, version, hashfunc) {
  function generateUUID(value, namespace, buf, offset) {
    if (typeof value === 'string') {
      value = stringToBytes(value);
    }

    if (typeof namespace === 'string') {
      namespace = parse(namespace);
    }

    if (namespace.length !== 16) {
      throw TypeError('Namespace must be array-like (16 iterable integer values, 0-255)');
    } // Compute hash of namespace and value, Per 4.3
    // Future: Use spread syntax when supported on all platforms, e.g. `bytes =
    // hashfunc([...namespace, ... value])`


    var bytes = new Uint8Array(16 + value.length);
    bytes.set(namespace);
    bytes.set(value, namespace.length);
    bytes = hashfunc(bytes);
    bytes[6] = bytes[6] & 0x0f | version;
    bytes[8] = bytes[8] & 0x3f | 0x80;

    if (buf) {
      offset = offset || 0;

      for (var i = 0; i < 16; ++i) {
        buf[offset + i] = bytes[i];
      }

      return buf;
    }

    return stringify(bytes);
  } // Function#name is not settable on some platforms (#270)


  try {
    generateUUID.name = name; // eslint-disable-next-line no-empty
  } catch (err) {} // For CommonJS default export support


  generateUUID.DNS = DNS;
  generateUUID.URL = URL;
  return generateUUID;
}

/*
 * Browser-compatible JavaScript MD5
 *
 * Modification of JavaScript MD5
 * https://github.com/blueimp/JavaScript-MD5
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 *
 * Based on
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */
function md5(bytes) {
  if (typeof bytes === 'string') {
    var msg = unescape(encodeURIComponent(bytes)); // UTF8 escape

    bytes = new Uint8Array(msg.length);

    for (var i = 0; i < msg.length; ++i) {
      bytes[i] = msg.charCodeAt(i);
    }
  }

  return md5ToHexEncodedArray(wordsToMd5(bytesToWords(bytes), bytes.length * 8));
}
/*
 * Convert an array of little-endian words to an array of bytes
 */


function md5ToHexEncodedArray(input) {
  var output = [];
  var length32 = input.length * 32;
  var hexTab = '0123456789abcdef';

  for (var i = 0; i < length32; i += 8) {
    var x = input[i >> 5] >>> i % 32 & 0xff;
    var hex = parseInt(hexTab.charAt(x >>> 4 & 0x0f) + hexTab.charAt(x & 0x0f), 16);
    output.push(hex);
  }

  return output;
}
/**
 * Calculate output length with padding and bit length
 */


function getOutputLength(inputLength8) {
  return (inputLength8 + 64 >>> 9 << 4) + 14 + 1;
}
/*
 * Calculate the MD5 of an array of little-endian words, and a bit length.
 */


function wordsToMd5(x, len) {
  /* append padding */
  x[len >> 5] |= 0x80 << len % 32;
  x[getOutputLength(len) - 1] = len;
  var a = 1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d = 271733878;

  for (var i = 0; i < x.length; i += 16) {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    a = md5ff(a, b, c, d, x[i], 7, -680876936);
    d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, x[i], 20, -373897302);
    a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, x[i], 11, -358537222);
    c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = md5ii(a, b, c, d, x[i], 6, -198630844);
    d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  return [a, b, c, d];
}
/*
 * Convert an array bytes to an array of little-endian words
 * Characters >255 have their high-byte silently ignored.
 */


function bytesToWords(input) {
  if (input.length === 0) {
    return [];
  }

  var length8 = input.length * 8;
  var output = new Uint32Array(getOutputLength(length8));

  for (var i = 0; i < length8; i += 8) {
    output[i >> 5] |= (input[i / 8] & 0xff) << i % 32;
  }

  return output;
}
/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */


function safeAdd(x, y) {
  var lsw = (x & 0xffff) + (y & 0xffff);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return msw << 16 | lsw & 0xffff;
}
/*
 * Bitwise rotate a 32-bit number to the left.
 */


function bitRotateLeft(num, cnt) {
  return num << cnt | num >>> 32 - cnt;
}
/*
 * These functions implement the four basic operations the algorithm uses.
 */


function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function md5ff(a, b, c, d, x, s, t) {
  return md5cmn(b & c | ~b & d, a, b, x, s, t);
}

function md5gg(a, b, c, d, x, s, t) {
  return md5cmn(b & d | c & ~d, a, b, x, s, t);
}

function md5hh(a, b, c, d, x, s, t) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}

function md5ii(a, b, c, d, x, s, t) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}

v35('v3', 0x30, md5);

function v4(options, buf, offset) {
  options = options || {};
  var rnds = options.random || (options.rng || rng)(); // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`

  rnds[6] = rnds[6] & 0x0f | 0x40;
  rnds[8] = rnds[8] & 0x3f | 0x80; // Copy bytes to buffer, if provided

  if (buf) {
    offset = offset || 0;

    for (var i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }

    return buf;
  }

  return stringify(rnds);
}

// Adapted from Chris Veness' SHA1 code at
// http://www.movable-type.co.uk/scripts/sha1.html
function f(s, x, y, z) {
  switch (s) {
    case 0:
      return x & y ^ ~x & z;

    case 1:
      return x ^ y ^ z;

    case 2:
      return x & y ^ x & z ^ y & z;

    case 3:
      return x ^ y ^ z;
  }
}

function ROTL(x, n) {
  return x << n | x >>> 32 - n;
}

function sha1(bytes) {
  var K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];
  var H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];

  if (typeof bytes === 'string') {
    var msg = unescape(encodeURIComponent(bytes)); // UTF8 escape

    bytes = [];

    for (var i = 0; i < msg.length; ++i) {
      bytes.push(msg.charCodeAt(i));
    }
  } else if (!Array.isArray(bytes)) {
    // Convert Array-like to Array
    bytes = Array.prototype.slice.call(bytes);
  }

  bytes.push(0x80);
  var l = bytes.length / 4 + 2;
  var N = Math.ceil(l / 16);
  var M = new Array(N);

  for (var _i = 0; _i < N; ++_i) {
    var arr = new Uint32Array(16);

    for (var j = 0; j < 16; ++j) {
      arr[j] = bytes[_i * 64 + j * 4] << 24 | bytes[_i * 64 + j * 4 + 1] << 16 | bytes[_i * 64 + j * 4 + 2] << 8 | bytes[_i * 64 + j * 4 + 3];
    }

    M[_i] = arr;
  }

  M[N - 1][14] = (bytes.length - 1) * 8 / Math.pow(2, 32);
  M[N - 1][14] = Math.floor(M[N - 1][14]);
  M[N - 1][15] = (bytes.length - 1) * 8 & 0xffffffff;

  for (var _i2 = 0; _i2 < N; ++_i2) {
    var W = new Uint32Array(80);

    for (var t = 0; t < 16; ++t) {
      W[t] = M[_i2][t];
    }

    for (var _t = 16; _t < 80; ++_t) {
      W[_t] = ROTL(W[_t - 3] ^ W[_t - 8] ^ W[_t - 14] ^ W[_t - 16], 1);
    }

    var a = H[0];
    var b = H[1];
    var c = H[2];
    var d = H[3];
    var e = H[4];

    for (var _t2 = 0; _t2 < 80; ++_t2) {
      var s = Math.floor(_t2 / 20);
      var T = ROTL(a, 5) + f(s, b, c, d) + e + K[s] + W[_t2] >>> 0;
      e = d;
      d = c;
      c = ROTL(b, 30) >>> 0;
      b = a;
      a = T;
    }

    H[0] = H[0] + a >>> 0;
    H[1] = H[1] + b >>> 0;
    H[2] = H[2] + c >>> 0;
    H[3] = H[3] + d >>> 0;
    H[4] = H[4] + e >>> 0;
  }

  return [H[0] >> 24 & 0xff, H[0] >> 16 & 0xff, H[0] >> 8 & 0xff, H[0] & 0xff, H[1] >> 24 & 0xff, H[1] >> 16 & 0xff, H[1] >> 8 & 0xff, H[1] & 0xff, H[2] >> 24 & 0xff, H[2] >> 16 & 0xff, H[2] >> 8 & 0xff, H[2] & 0xff, H[3] >> 24 & 0xff, H[3] >> 16 & 0xff, H[3] >> 8 & 0xff, H[3] & 0xff, H[4] >> 24 & 0xff, H[4] >> 16 & 0xff, H[4] >> 8 & 0xff, H[4] & 0xff];
}

v35('v5', 0x50, sha1);

class Consumer {
    constructor(owner, options = {}) {
        this.owner = owner;
    }

    static async build(options = {}) {
        throw new NotImplementedError();
    }

    async connect() {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }

    async consume(topics, options = {}) {
        throw new NotImplementedError();
    }

    async topics() {
        throw new NotImplementedError();
    }
}

class KafkaConsumer extends Consumer {
    static async build(owner, options = {}) {
        const instance = new this(owner, options);
        await instance.init(options);
        return instance;
    }

    async init(options = {}) {
        this.groupId = conf("KAFKA_CONSUMER_GROUP_ID", this._randomValue());
        this.minBytes = conf("KAFKA_CONSUMER_FETCH_MIN_BYTES", 1);
        this.maxBytes = conf("KAFKA_CONSUMER_FETCH_MAX_BYTES", 1024 * 1024);
        this.maxWaitTimeInMs = conf("KAFKA_CONSUMER_FETCH_MAX_WAIT", 100);
        this.autoCommit = conf("KAFKA_CONSUMER_AUTO_COMMIT", true);
        this.autoCommitInterval = conf("KAFKA_CONSUMER_AUTO_COMMIT_INTERVAL", 5000);
        this.autoCommitThreshold = conf("KAFKA_CONSUMER_AUTO_COMMIT_THRESHOLD", 1);
        this.partitionsConsumedConcurrently = conf(
            "KAFKA_CONSUMER_PARTITIONS_CONSUMED_CONCURRENTLY",
            1
        );
        this.eachBatchAutoResolve = conf("KAFKA_CONSUMER_BATCH_AUTO_RESOLVE", true);

        this.groupId = options.groupId === undefined ? this.groupId : options.groupId;
        this.minBytes = options.minBytes === undefined ? this.minBytes : options.minBytes;
        this.maxBytes = options.maxBytes === undefined ? this.maxBytes : options.maxBytes;
        this.maxWaitTimeInMs =
            options.maxWaitTimeInMs === undefined ? this.maxWaitTimeInMs : options.maxWaitTimeInMs;
        this.autoCommit = options.autoCommit === undefined ? this.autoCommit : options.autoCommit;
        this.autoCommitInterval =
            options.autoCommitInterval === undefined
                ? this.autoCommitInterval
                : options.autoCommitInterval;
        this.autoCommitThreshold =
            options.autoCommitThreshold === undefined
                ? this.autoCommitThreshold
                : options.autoCommitThreshold;
        this.partitionsConsumedConcurrently =
            options.partitionsConsumedConcurrently === undefined
                ? this.partitionsConsumedConcurrently
                : options.partitionsConsumedConcurrently;
        this.eachBatchAutoResolve =
            options.eachBatchAutoResolve === undefined
                ? this.eachBatchAutoResolve
                : options.eachBatchAutoResolve;

        const kafkaClient = await KafkaClient.getInstance();
        this.consumer = kafkaClient.client.consumer({
            groupId: this.groupId,
            minBytes: this.minBytes,
            maxBytes: this.maxBytes,
            maxWaitTimeInMs: this.maxWaitTimeInMs
        });

        this.topicCallbacks = {};
        this.running = false;
    }

    async connect() {
        await this.consumer.connect();
    }

    async disconnect() {
        await this.consumer.disconnect();
        this.running = false;
    }

    /**
     * Subscribes the consumer to the given topics and starts
     * consuming if the `run` flag is set.
     * If the consumer was already running, it is stopped
     * before the topic subscription, due to library limitations.
     *
     * @param {Array|String} topics Topics to consume messages from.
     * @param {Object} options Object that includes the callback for
     * the message processing, callbacks for other events and
     * configuration variables.
     */
    async consume(topics, options = {}) {
        // coerces a possible string value into an array so that
        // the remaining logic becomes consistent
        topics = Array.isArray(topics) ? topics : [topics];

        // sanitizes topic names according to Kafka topic naming rules
        // avoiding illegal topic naming
        topics = topics.map(topic => KafkaClient.sanitizeTopic(topic));

        // if the consumer is already running, stops it to
        // subscribe to another topic (this is required by design)
        if (this.running) await this.consumer.stop();

        // subscribes to the complete set of requested topics (async fashion)
        // and wait for the respective promises in parallel
        await Promise.all(
            topics.map(async topic => await this.consumer.subscribe({ topic: topic }))
        );

        // normalizes the events value as a sequence making sure that if a basic
        // type is provided it's encapsulated as an array
        const events =
            options.events === undefined
                ? null
                : Array.isArray(options.events)
                ? options.events
                : [options.events];

        // saves the callbacks for each topic and event and overrides them with
        // with the current callback if the option is defined
        topics.forEach(topic => {
            const callbacks = options.override ? {} : this.topicCallbacks[topic] || {};
            if (events) {
                events.forEach(event => (callbacks[event] = options.callback));
            } else {
                callbacks["*"] = options.callback;
            }
            this.topicCallbacks[topic] = callbacks;
        });

        // run the consumer only if the flag is true, making it
        // possible to subscribe to several topics first and
        // then execute the consumer
        if (options.run) await this._runConsumer(options);

        // if the event loop should be blocked under the async
        // execution, then runs an infinite await operation over
        // a promise that is never resolved
        if (options.block) await new Promise(() => true);
    }

    /**
     * Returns the available topics from adapter, may imply
     * a remote connection to perform it.
     *
     * @returns {Array} The list of the available topics.
     */
    async topics() {
        const kafkaClient = await KafkaClient.getInstance();
        const topics = await kafkaClient.client.admin().listTopics();
        return topics;
    }

    /**
     * Starts the consumer with the given configuration and
     * processes each message.
     *
     * @param {Object} options Object that contains configuration
     * variables and callback functions.
     */
    async _runConsumer(options = {}) {
        const autoCommit = options.autoCommit === undefined ? this.autoCommit : options.autoCommit;
        const autoCommitInterval =
            options.autoCommitInterval === undefined
                ? this.autoCommitInterval
                : options.autoCommitInterval;
        const autoCommitThreshold =
            options.autoCommitThreshold === undefined
                ? this.autoCommitThreshold
                : options.autoCommitThreshold;
        const partitionsConsumedConcurrently =
            options.partitionsConsumedConcurrently === undefined
                ? this.partitionsConsumedConcurrently
                : options.partitionsConsumedConcurrently;
        const eachBatchAutoResolve =
            options.eachBatchAutoResolve === undefined
                ? this.eachBatchAutoResolve
                : options.eachBatchAutoResolve;

        this.running = true;
        await this.consumer.run({
            autoCommit: autoCommit,
            autoCommitInterval: autoCommitInterval,
            autoCommitThreshold: autoCommitThreshold,
            partitionsConsumedConcurrently: partitionsConsumedConcurrently,
            eachBatchAutoResolve: eachBatchAutoResolve,
            eachBatch: async ({ batch, heartbeat, isRunning, isStale }) => {
                for (const message of batch.messages) {
                    // does not process message if message is marked
                    // as stale or if the consumer is not running
                    if (!isRunning() || isStale()) return;

                    try {
                        // deserialize the message from its serialized structure
                        // so that it can be properly handled
                        const messageD = this._deserializeMessage(message);

                        // processes the message, notifying any listener about
                        // its reception, the processing of the message is done
                        // for the provided topic and taking into consideration
                        // the provided set of options
                        await this._processMessage(messageD, batch.topic, options);
                    } catch (err) {
                        console.error(
                            `Problem handling message (offset=${message.offset}, timestamp=${message.timestamp}) in topic '${batch.topic}'`
                        );
                        console.error(`Error name: ${err.name}`);
                        console.error(`Error message: ${err.message}`);
                        if (err.stack) {
                            console.error(`Error stack:\n${err.stack}`);
                        }
                        if (err.code) {
                            console.error(`Error code: ${err.code}`);
                        }
                        console.trace("Call stack:");
                    } finally {
                        await heartbeat();
                    }
                }
            }
        });
    }

    /**
     * Calls the given callbacks for the topic and event and sends
     * a message confirming that the event was processed. The
     * `onSuccess` logic can be outsourced if a function
     * was provided.
     *
     * @param {Object} message Message consumed by the consumer.
     * @param {String} topic Topic where the message was consumed.
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _processMessage(message, topic, options) {
        // retrieves all the callbacks for the provided: message, topic
        // and event to be able to call them latter
        const callbackPromises = Object.entries(this.topicCallbacks[topic])
            .filter(([event, callback]) => event === message.name || event === "*")
            .map(([event, callback]) => callback(message, topic));

        // returns the control flow immediately in case there
        // are no callbacks to be called, this ensures that the
        // message is not marked as "consumed" as there are no
        // valid callbacks called for it
        if (callbackPromises.length === 0) return;

        // waits for all the callback promises to be fulfilled
        // (keep in mind that execution is done in parallel)
        await Promise.all(callbackPromises);

        // in case an on success callback is defined in the options
        // object then such callback is called
        if (options.onSuccess) options.onSuccess(message, topic);
    }

    _deserializeMessage(message) {
        return JSON.parse(message.value.toString());
    }

    _randomValue() {
        let randomValue;
        try {
            randomValue = v4();
        } catch (err) {
            const randomPart = () => Math.random().toString(36).substring(2, 15);
            randomValue = randomPart() + randomPart();
        }
        return randomValue;
    }
}

class Producer {
    constructor(owner, options = {}) {
        this.owner = owner;
    }

    static async build(options = {}) {
        throw new NotImplementedError();
    }

    async connect() {
        throw new NotImplementedError();
    }

    async disconnect() {
        throw new NotImplementedError();
    }

    async produce(topic, message, options = {}) {
        throw new NotImplementedError();
    }

    async topics() {
        throw new NotImplementedError();
    }
}

class KafkaProducer extends Producer {
    static async build(owner, options = {}) {
        const instance = new this(owner, options);
        await instance.init(options);
        return instance;
    }

    async init(options = {}) {
        this.globalDiffusion = conf("GLOBAL_DIFFUSION", true);
        this.metadataMaxAge = conf("KAFKA_PRODUCER_METADATA_MAX_AGE", 300000);
        this.allowAutoTopicCreation = conf("KAFKA_PRODUCER_AUTO_TOPIC_CREATION", true);
        this.transactionTimeout = conf("KAFKA_PRODUCER_TRANSACTION_TIMEOUT", 60000);
        this.acks = conf("KAFKA_PRODUCER_ACKS", 0);
        this.timeout = conf("KAFKA_PRODUCER_TIMEOUT", 30000);
        this.compression = conf("KAFKA_PRODUCER_COMPRESSION", null);
        this.maxInFlightRequests = conf("KAFKA_PRODUCER_MAX_INFLIGHT_REQUESTS", null);

        this.globalDiffusion =
            options.globalDiffusion === undefined ? this.globalDiffusion : options.globalDiffusion;
        this.metadataMaxAge =
            options.producerMetadataMaxAge === undefined
                ? this.metadataMaxAge
                : options.producerMetadataMaxAge;
        this.allowAutoTopicCreation =
            options.producerAutoTopicCreation === undefined
                ? this.allowAutoTopicCreation
                : options.producerAutoTopicCreation;
        this.transactionTimeout =
            options.producerTransactionTimeout === undefined
                ? this.transactionTimeout
                : options.producerTransactionTimeout;
        this.acks = options.producerAcks === undefined ? this.acks : options.producerAcks;
        this.timeout =
            options.producerTimeout === undefined ? this.timeout : options.producerTimeout;
        this.compression =
            options.producerCompression === undefined
                ? this.compression
                : options.producerCompression;
        this.maxInFlightRequests =
            options.maxInFlightRequests === undefined
                ? this.maxInFlightRequests
                : options.producerMaxInFlightRequests;

        const kafkaClient = await KafkaClient.getInstance(options);
        this.producer = kafkaClient.client.producer({
            metadataMaxAge: this.metadataMaxAge,
            allowAutoTopicCreation: this.allowAutoTopicCreation,
            transactionTimeout: this.transactionTimeout,
            maxInFlightRequests: this.maxInFlightRequests
        });
    }

    async connect() {
        await this.producer.connect();
    }

    async disconnect() {
        await this.producer.disconnect();
    }

    /**
     * Converts messages to an array of strings and sends
     * it to a specified topic and the global topic when
     * using global diffusion.
     *
     * @param {String} topic Topic to send messages to.
     * @param {Array|Object|String} message Message or messages
     * to be sent.
     * @param {Object} options Object that includes configuration
     * variables.
     */
    async produce(topic, message, options = {}) {
        await this.producer.send({
            topic: KafkaClient.sanitizeTopic(topic),
            acks: options.producerAcks ? this.acks : options.producerAcks,
            timeout: options.producerTimeout ? this.timeout : options.producerTimeout,
            compression: KafkaClient.convertCompression(
                options.producerCompression ? this.compression : options.producerCompression
            ),
            messages: this._serializeMessage(message)
        });
    }

    /**
     * Returns the available topics from adapter, may imply
     * a remote connection to perform it.
     *
     * @returns {Array} The list of the available topics.
     */
    async topics() {
        const kafkaClient = await KafkaClient.getInstance();
        const topics = await kafkaClient.client.admin().listTopics();
        return topics;
    }

    _serializeMessage(messages) {
        return (Array.isArray(messages) ? messages : [messages]).map(message => ({
            value: JSON.stringify(message)
        }));
    }
}

class KafkaRetryConsumer extends KafkaConsumer {
    async init(options = {}) {
        await super.init(options);

        this.retries = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_RETRIES", 5);
        this.retryInterval = conf("KAFKA_CONSUMER_MESSAGE_RETRY_INTERVAL", 1000);
        this.retryDelay = conf("KAFKA_CONSUMER_MESSAGE_FIRST_DELAY", 50);
        this.messageFailureMaxTime = conf("KAFKA_CONSUMER_MESSAGE_FAILURE_MAX_TIME", null);
        this.messageDelayExponential = conf("KAFKA_CONSUMER_MESSAGE_DELAY_EXPONENTIAL", 2);
        this.retryPersistenceDir = conf("KAFKA_CONSUMER_RETRY_PERSISTENCE_DIR", "data");

        this.retries = options.retries === undefined ? this.retries : options.retries;
        this.retryInterval =
            options.retryInterval === undefined ? this.retryInterval : options.retryInterval;
        this.retryDelay = options.retryDelay === undefined ? this.retryDelay : options.retryDelay;
        this.messageFailureMaxTime =
            options.messageFailureMaxTime === undefined
                ? this.messageFailureMaxTime
                : options.messageFailureMaxTime;
        this.messageDelayExponential =
            options.messageDelayExponential === undefined
                ? this.messageDelayExponential
                : options.messageDelayExponential;
        this.retryPersistenceDir =
            options.retryPersistenceDir === undefined
                ? this.retryPersistenceDir
                : options.retryPersistenceDir;

        this.retryBuffer = [];
        this._readFromBufferFile();
    }

    async disconnect() {
        await super.disconnect();
        if (this.retryIntervalId) clearInterval(this.retryIntervalId);
    }

    /**
     * Subscribes the consumer to the given topic and
     * starts consuming if the `run` flag is set.
     * If the consumer was already running, it is stopped
     * before the topic subscription, due to library limitations.
     * Sets the retry interval, checking each second to see
     * if the processing of each message can be retried.
     *
     * @param {Array|String} topics Topics to consume messages from.
     * @param {Object} options Object that includes the callback for
     * the message processing, callbacks for other events and
     * configuration variables.
     */
    async consume(topics, options = {}) {
        // coerces a possible string value into an array so that
        // the remaining logic becomes consistent
        topics = Array.isArray(topics) ? topics : [topics];

        // sanitizes topic names according to Kafka
        // topic naming rules
        topics = topics.map(topic => KafkaClient.sanitizeTopic(topic));

        // if the consumer is already running, stops it to
        // subscribe to another topic
        if (this.running) await this.consumer.stop();

        // subscribes to the complete set of requested topics (async fashion)
        // and wait for the respective promises in parallel
        await Promise.all(
            topics.map(async topic => await this.consumer.subscribe({ topic: topic }))
        );

        // normalizes the events value as a sequence making sure that if a basic
        // type is provided it's encapsulated as an array
        const events =
            options.events === undefined
                ? null
                : Array.isArray(options.events)
                ? options.events
                : [options.events];

        // saves the callbacks for each topic and event and overrides them with
        // with the current callback if the option is defined
        topics.forEach(topic => {
            const callbacks = options.override ? {} : this.topicCallbacks[topic] || {};
            if (events) {
                events.forEach(event => (callbacks[event] = options.callback));
            } else {
                callbacks["*"] = options.callback;
            }
            this.topicCallbacks[topic] = callbacks;
        });

        // retries processing previously failed messages every
        // retry interval
        this.retryIntervalId = setInterval(() => this._retry(options), this.retryInterval);

        // run the consumer only if the flag is true, making it
        // possible to subscribe to several topics first and
        // then execute the consumer
        if (options.run) await this._runConsumer(options);

        // if the event loop should be blocked under the async
        // execution, then runs an infinite await operation over
        // a promise that is never resolved
        if (options.block) await new Promise(() => true);
    }

    /**
     * Calls the given callback for the topic and event. If the
     * processing fails, adds the message to a retry buffer,
     * to be retried later.
     *
     * @param {Object} message Message consumed by the consumer.
     * @param {String} topic Topic where the message was consumed.
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _processMessage(message, topic, options) {
        const retries = options.retries === undefined ? this.retries : options.retries;
        const retryDelay = options.retryDelay === undefined ? this.retryDelay : options.retryDelay;

        try {
            await this._callCallbacks(message, topic, options);
        } catch (err) {
            // if the message processing fails, the message is
            // added to a retry buffer that will retry in an
            // exponentially increasing delay
            this.retryBuffer.push({
                ...message,
                firstFailure: Date.now(),
                lastRetry: Date.now(),
                topic: topic,
                retries: retries,
                retryDelay: retryDelay
            });
            await this._updateBufferFile();
        }
    }

    /**
     * Retries the processing of the messages in the retry buffer.
     * If the message expires its retries, an event is sent announcing
     * the failure. This `onError` logic can be outsourced if a function
     * was provided.
     *
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _retry(options = {}) {
        // iterates over the complete set of messages to be processed
        // under the retry promise
        for (let i = 0; i < this.retryBuffer.length; i++) {
            // gather the message to be processed in the current loop
            const message = this.retryBuffer[i];

            // if there are no retries left or the maximum time
            // for retries has passed, send the failed event to
            // a topic and remove the message from the retry buffer
            const messageFailureMaxTime =
                options.messageFailureMaxTime === undefined
                    ? this.messageFailureMaxTime
                    : options.messageFailureMaxTime;
            if (
                message.retries === 0 ||
                (messageFailureMaxTime &&
                    Date.now() - message.firstFailure >= messageFailureMaxTime)
            ) {
                this.retryBuffer.splice(i, 1);
                await this._updateBufferFile();
                i--;

                if (!options.autoConfirm) continue;
                if (options.onError) options.onError(message);
                else this.owner.trigger("error", message);
                continue;
            }

            // in case the time for processing of the message has not been
            // reached then continue the loop trying to find valid messages
            if (Date.now() < message.lastRetry + message.retryDelay) continue;

            try {
                await this._callCallbacks(message, message.topic, options);

                this.retryBuffer.splice(i, 1);
                await this._updateBufferFile();
                i--;

                if (options.onSuccess) options.onSuccess(message, message.topic);
            } catch (err) {
                // increases the delay time exponentially while
                // decreasing the number of retries available
                const messageDelayExponential =
                    options.messageDelayExponential === undefined
                        ? this.messageDelayExponential
                        : options.messageDelayExponential;
                const updatedMessage = {
                    ...message,
                    lastRetry: Date.now(),
                    retries: message.retries - 1,
                    retryDelay: message.retryDelay * messageDelayExponential
                };
                this.retryBuffer[i] = updatedMessage;
                await this._updateBufferFile();
                continue;
            }
        }
    }

    /**
     * Calls the given callback for the topic and event and sends
     * a message confirming that the event was processed. The
     * `onSuccess` logic can be outsourced if a function
     * was provided.
     *
     * @param {Object} message Message consumed by the consumer.
     * @param {String} topic Topic where the message was consumed.
     * @param {Object} options Object that contains configuration
     * variables and callback methods.
     */
    async _callCallbacks(message, topic, options) {
        // retrieves all the callbacks for the provided: message, topic
        // and event to be able to call them latter
        const callbackPromises = Object.entries(this.topicCallbacks[topic])
            .filter(([event, callback]) => event === message.name || event === "*")
            .map(([event, callback]) => callback(message, topic));

        // returns the control flow immediately in case there
        // are no callbacks to be called, this ensures that the
        // message is not marked as "consumed" as there were no
        // valid callbacks called for it
        if (callbackPromises.length === 0) return;

        // waits for all the callback promises to be fulfilled
        // (keep in mind that execution is done in parallel)
        await Promise.all(callbackPromises);

        // in case an on success callback is defined in the options
        // object then such callback is called
        if (options.onSuccess) options.onSuccess(message, topic);
    }

    /**
     * Reads the file with the persisted retry buffer and
     * populates the buffer.
     */
    async _readFromBufferFile() {
        try {
            await fs.promises.access(
                this.retryPersistenceDir,
                fs.constants.R_OK | fs.constants.W_OK
            );
        } catch (err) {
            await fs.promises.mkdir(this.retryPersistenceDir);
            return;
        }

        // if the file exists, reads it and populates
        // the retryBuffer, if not ignores and returns
        const data = await fs.promises.readFile(`${this.retryPersistenceDir}/retry.json`, {
            encoding: "utf-8"
        });
        this.retryBuffer = JSON.parse(data);
    }

    /**
     * Updates the persisted retry file with the current
     * retry buffer.
     */
    async _updateBufferFile() {
        await fs.promises.writeFile(
            `${this.retryPersistenceDir}/retry.json`,
            JSON.stringify(this.retryBuffer),
            "utf-8"
        );
    }
}

class KafkaRetryProducer extends KafkaProducer {}

function hostname() {
  if (typeof global$1.location !== 'undefined') {
    return global$1.location.hostname
  } else return '';
}

const adapters = {
    KafkaProducer,
    KafkaConsumer,
    KafkaRetryProducer,
    KafkaRetryConsumer
};

class API {
    constructor(options = {}) {
        this.consumer = null;
        this.producer = null;
        this.options = options;

        this.busAdapter = conf("BUS_ADAPTER", "kafka");
        this.busAdapter =
            this.options.adapter === undefined ? this.busAdapter : this.options.adapter;
    }

    static async load() {
        await load();
    }

    /**
     * Builds a producer if it doesn't already have one and sends
     * the message according to the provided name.
     *
     * @param {String} name Event name in a canonical form should be
     * represented by domain separated by the `.` character.
     * @param {Array|Object|String} payload Message payload to be sent,
     * should be serializable.
     * @param {Object} options Object that includes configuration
     * variables, including the name of the topic where the event is
     * going to be sent to.
     */
    async trigger(name, payload, options = {}) {
        await this._ensureProducer(options);

        const event = {
            name: name,
            origin: options.origin || null,
            hostname: options.hostname || hostname(),
            datatype: options.datatype || "json",
            timestamp: options.timestamp || Date.now(),
            payload: payload
        };

        const topic = options.topic || name.split(".", 1)[0];

        await this.producer.produce(topic, event, options);

        const globalDiffusion =
            options.globalDiffusion === undefined
                ? this.producer.globalDiffusion
                : options.globalDiffusion;
        const globalTopic = this._globalTopic(topic);
        if (globalDiffusion && globalTopic) await this.trigger(globalTopic, payload, options);
    }

    /**
     * Builds a consumer if it doesn't already have one and starts
     * consuming messages from the given topic, binding the
     * callback to any new messages from the topic. The options
     * can be a function, that corresponds to the callback, or
     * an object that contains the callback and other functions
     * and variables.
     *
     * @param {String} topic Topic to consume messages from.
     * @param {Function|Object} options Object that includes the
     * callback for the message processing, callbacks for other
     * events and configuration variables.
     */
    async bind(topic, options = {}) {
        let callback = null;

        if (typeof options === "function") {
            callback = options;
            options = {
                autoConfirm: true,
                run: true,
                block: false,
                ...this.options
            };
        } else if (typeof options === "object") {
            options = {
                autoConfirm: true,
                run: true,
                block: false,
                ...this.options,
                ...options
            };
        } else {
            throw new YoniusError("Invalid options type");
        }

        // updates the on success event handler defaulting to a standard
        // auto confirm implementation in case no on success is defined
        const onSuccessDefault = (message, topic) =>
            options.autoConfirm && this.trigger("confirmation.success", message);
        options.onSuccess = options.onSuccess === undefined ? onSuccessDefault : options.onSuccess;

        // makes sure that there's a valid consumer instance that is
        // connected to the proper remote provider
        await this._ensureConsumer(options);

        // start the consuming process for the requested topic
        // this may block the current execution into an event loop
        await this.consumer.consume(topic, { callback: callback, ...options });
    }

    async topics() {
        const producer = await this._getProducer();
        const topics = await producer.topics();
        return topics;
    }

    async destroy() {
        if (this.consumer) await this.consumer.disconnect();
        if (this.producer) await this.producer.disconnect();
    }

    get adapter() {
        return this.busAdapter[0].toUpperCase() + this.busAdapter.slice(1);
    }

    async _getProducer(options = {}) {
        await this._ensureProducer(options);
        return this.producer;
    }

    async _getConsumer(options = {}) {
        await this._ensureConsumer(options);
        return this.consumer;
    }

    async _ensureProducer(options = {}) {
        if (this.producer) return;
        await this._buildProducer(options);
    }

    async _ensureConsumer(options = {}) {
        if (this.consumer) return;
        await this._buildConsumer(options);
    }

    async _buildProducer(options = {}) {
        this.producer = await adapters[this.adapter + "Producer"].build(this, options);
        await this.producer.connect();
    }

    async _buildConsumer(options = {}) {
        this.consumer = await adapters[this.adapter + "Consumer"].build(this, options);
        await this.consumer.connect();
    }

    /**
     * Parses a topic name to extract the global topic.
     * For example, the global topic of "global:subdomain-123"
     * is "global".
     *
     * @param {String} topic The name of the topic to be parsed.
     * @returns {String} The global topic name.
     */
    _globalTopic(topic, separator = ":") {
        if (!topic.includes(separator)) return;
        return topic.substring(0, topic.lastIndexOf(separator));
    }
}

export { API, Consumer, KafkaClient, KafkaConsumer, KafkaProducer, KafkaRetryConsumer, KafkaRetryProducer, Producer };
//# sourceMappingURL=ripe-bus-api.esm.js.map
