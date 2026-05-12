function suppressKnownProtocolNoise() {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  const ignoredPatterns = [
    "Chunk size is",
    "PartialReadError: Read error for undefined",
    "packet_world_particles",
    "packet_common_select_known_packs",
    "Unexpected buffer end while reading VarInt",
    "protodef/src/datatypes/numeric.js",
    "protodef/src/datatypes/varint.js",
    "protodef/src/compiler.js",
    "CompiledProtodef.read"
  ];

  let suppressingStack = false;

  function shouldSuppress(text) {
    if (!text) return false;

    const value = String(text);

    if (ignoredPatterns.some((pattern) => value.includes(pattern))) {
      suppressingStack = true;
      return true;
    }

    if (suppressingStack && value.trim().startsWith("at ")) {
      return true;
    }

    if (suppressingStack && value.trim() === "") {
      suppressingStack = false;
      return true;
    }

    suppressingStack = false;
    return false;
  }

  process.stdout.write = (chunk, encoding, callback) => {
    if (shouldSuppress(chunk)) {
      if (typeof callback === "function") callback();
      return true;
    }

    return originalStdoutWrite(chunk, encoding, callback);
  };

  process.stderr.write = (chunk, encoding, callback) => {
    if (shouldSuppress(chunk)) {
      if (typeof callback === "function") callback();
      return true;
    }

    return originalStderrWrite(chunk, encoding, callback);
  };
}

module.exports = suppressKnownProtocolNoise;