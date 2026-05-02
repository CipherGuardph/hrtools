(function () {
  const VERSION = 3;
  const SIZE = 29;
  const DATA_CODEWORDS = 55;
  const ECC_CODEWORDS = 15;
  const PAD_BYTES = [0xEC, 0x11];
  const ALIGNMENT = [6, 22];
  const EC_LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

  const exp = new Array(512);
  const log = new Array(256).fill(0);

  for (let i = 0; i < 8; i++) {
    exp[i] = 1 << i;
  }
  for (let i = 8; i < 255; i++) {
    exp[i] = exp[i - 4] ^ exp[i - 5] ^ exp[i - 6] ^ exp[i - 8];
  }
  for (let i = 0; i < 255; i++) {
    log[exp[i]] = i;
  }
  for (let i = 255; i < 512; i++) {
    exp[i] = exp[i - 255];
  }

  function gfMul(a, b) {
    if (!a || !b) return 0;
    return exp[log[a] + log[b]];
  }

  function polyMul(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        out[i + j] ^= gfMul(a[i], b[j]);
      }
    }
    return out;
  }

  function reedSolomonGenerator(eccLen) {
    let gen = [1];
    for (let i = 0; i < eccLen; i++) {
      gen = polyMul(gen, [1, exp[i]]);
    }
    return gen;
  }

  function reedSolomonRemainder(data, eccLen) {
    const gen = reedSolomonGenerator(eccLen);
    const work = data.slice();
    work.push(...new Array(eccLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = work[i];
      if (!factor) continue;
      for (let j = 0; j < gen.length; j++) {
        work[i + j] ^= gfMul(gen[j], factor);
      }
    }
    return work.slice(work.length - eccLen);
  }

  function toBytes(text) {
    return Array.from(new TextEncoder().encode(text));
  }

  function pushBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  }

  function buildCodewords(text) {
    const bytes = toBytes(text);
    const bits = [];

    pushBits(bits, 0b0100, 4);
    pushBits(bits, bytes.length, 8);
    for (const byte of bytes) {
      pushBits(bits, byte, 8);
    }

    const capacityBits = DATA_CODEWORDS * 8;
    const remaining = capacityBits - bits.length;
    if (remaining < 0) {
      throw new Error("The mailto link is too long for this QR size.");
    }

    pushBits(bits, 0, Math.min(4, remaining));
    while (bits.length % 8 !== 0) bits.push(0);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j++) {
        value = (value << 1) | bits[i + j];
      }
      data.push(value);
    }

    let padIndex = 0;
    while (data.length < DATA_CODEWORDS) {
      data.push(PAD_BYTES[padIndex % 2]);
      padIndex++;
    }

    return data.concat(reedSolomonRemainder(data, ECC_CODEWORDS));
  }

  function createMatrix() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function mark(reserved, x, y) {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
      reserved[y][x] = true;
    }
  }

  function set(matrix, reserved, x, y, value, isReserved = true) {
    matrix[y][x] = !!value;
    if (isReserved) mark(reserved, x, y);
  }

  function drawFinder(matrix, reserved, ox, oy) {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const xx = ox + x;
        const yy = oy + y;
        if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue;
        const inCore = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const isBlack = inCore && (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        set(matrix, reserved, xx, yy, isBlack, true);
      }
    }
  }

  function drawAlignment(matrix, reserved, cx, cy) {
    for (let y = -2; y <= 2; y++) {
      for (let x = -2; x <= 2; x++) {
        const xx = cx + x;
        const yy = cy + y;
        const dist = Math.max(Math.abs(x), Math.abs(y));
        const isBlack = dist === 2 || (x === 0 && y === 0);
        set(matrix, reserved, xx, yy, isBlack, true);
      }
    }
  }

  function drawFunctionPatterns(matrix, reserved) {
    drawFinder(matrix, reserved, 0, 0);
    drawFinder(matrix, reserved, SIZE - 7, 0);
    drawFinder(matrix, reserved, 0, SIZE - 7);

    for (let i = 8; i < SIZE - 8; i++) {
      const bit = i % 2 === 0;
      set(matrix, reserved, i, 6, bit, true);
      set(matrix, reserved, 6, i, bit, true);
    }

    drawAlignment(matrix, reserved, 22, 22);
    set(matrix, reserved, 8, SIZE - 8, true, true);

    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        mark(reserved, 8, i);
        mark(reserved, i, 8);
      }
    }
    for (let i = SIZE - 8; i < SIZE; i++) {
      mark(reserved, 8, i);
      mark(reserved, i, 8);
    }
    mark(reserved, 8, 8);
  }

  function formatBits(mask) {
    let data = ((EC_LEVEL_BITS.L << 3) | mask) << 10;
    const generator = 0x537;
    const bitLength = value => {
      let length = 0;
      while (value) {
        length++;
        value >>>= 1;
      }
      return length;
    };
    while (bitLength(data) - bitLength(generator) >= 0) {
      data ^= generator << (bitLength(data) - bitLength(generator));
    }
    return ((((EC_LEVEL_BITS.L << 3) | mask) << 10) | data) ^ 0x5412;
  }

  function placeFormatInfo(matrix, reserved, mask) {
    const bits = formatBits(mask);
    const coordsA = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8],
      [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    ];
    const coordsB = [
      [SIZE - 1, 8], [SIZE - 2, 8], [SIZE - 3, 8], [SIZE - 4, 8], [SIZE - 5, 8],
      [SIZE - 6, 8], [SIZE - 7, 8], [8, SIZE - 8], [8, SIZE - 7], [8, SIZE - 6],
      [8, SIZE - 5], [8, SIZE - 4], [8, SIZE - 3], [8, SIZE - 2], [8, SIZE - 1],
    ];
    for (let i = 0; i < 15; i++) {
      const bit = (bits >>> (14 - i)) & 1;
      set(matrix, reserved, coordsA[i][0], coordsA[i][1], bit, true);
      set(matrix, reserved, coordsB[i][0], coordsB[i][1], bit, true);
    }
  }

  function placeData(matrix, reserved, codewords, maskFn) {
    const bits = [];
    for (const codeword of codewords) {
      pushBits(bits, codeword, 8);
    }

    let bitIndex = 0;
    let row = SIZE - 1;
    let direction = -1;

    for (let col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (let c = 0; c < 2; c++) {
          const x = col - c;
          const y = row;
          if (reserved[y][x]) continue;
          const bit = bitIndex < bits.length ? bits[bitIndex++] : 0;
          const masked = maskFn(x, y, bit);
          matrix[y][x] = !!masked;
        }
        row += direction;
        if (row < 0 || row >= SIZE) {
          row -= direction;
          direction = -direction;
          break;
        }
      }
    }
  }

  function maskValue(mask, x, y, bit) {
    let invert = false;
    switch (mask) {
      case 0: invert = ((x + y) % 2) === 0; break;
      case 1: invert = (y % 2) === 0; break;
      case 2: invert = (x % 3) === 0; break;
      case 3: invert = ((x + y) % 3) === 0; break;
      case 4: invert = (((Math.floor(y / 2) + Math.floor(x / 3)) % 2) === 0); break;
      case 5: invert = (((x * y) % 2) + ((x * y) % 3) === 0); break;
      case 6: invert = ((((x * y) % 2) + ((x * y) % 3)) % 2 === 0); break;
      case 7: invert = ((((x + y) % 2) + ((x * y) % 3)) % 2 === 0); break;
      default: break;
    }
    return invert ? !bit : !!bit;
  }

  function cloneMatrix(matrix) {
    return matrix.map(row => row.slice());
  }

  function scoreMatrix(matrix) {
    let penalty = 0;

    for (let y = 0; y < SIZE; y++) {
      let runColor = matrix[y][0];
      let runLength = 1;
      for (let x = 1; x < SIZE; x++) {
        const color = matrix[y][x];
        if (color === runColor) {
          runLength++;
        } else {
          if (runLength >= 5) penalty += 3 + (runLength - 5);
          runColor = color;
          runLength = 1;
        }
      }
      if (runLength >= 5) penalty += 3 + (runLength - 5);
    }

    for (let x = 0; x < SIZE; x++) {
      let runColor = matrix[0][x];
      let runLength = 1;
      for (let y = 1; y < SIZE; y++) {
        const color = matrix[y][x];
        if (color === runColor) {
          runLength++;
        } else {
          if (runLength >= 5) penalty += 3 + (runLength - 5);
          runColor = color;
          runLength = 1;
        }
      }
      if (runLength >= 5) penalty += 3 + (runLength - 5);
    }

    for (let y = 0; y < SIZE - 1; y++) {
      for (let x = 0; x < SIZE - 1; x++) {
        const color = matrix[y][x];
        if (
          matrix[y][x + 1] === color &&
          matrix[y + 1][x] === color &&
          matrix[y + 1][x + 1] === color
        ) {
          penalty += 3;
        }
      }
    }

    const pattern = [true, false, true, true, true, false, true, false, false, false, false];
    const inverse = pattern.map(v => !v);
    const checkPattern = sequence => {
      for (let i = 0; i <= sequence.length - pattern.length; i++) {
        let hit = true;
        for (let j = 0; j < pattern.length; j++) {
          if (sequence[i + j] !== pattern[j]) {
            hit = false;
            break;
          }
        }
        if (hit) penalty += 40;
        hit = true;
        for (let j = 0; j < inverse.length; j++) {
          if (sequence[i + j] !== inverse[j]) {
            hit = false;
            break;
          }
        }
        if (hit) penalty += 40;
      }
    };

    for (let y = 0; y < SIZE; y++) checkPattern(matrix[y]);
    for (let x = 0; x < SIZE; x++) {
      const col = [];
      for (let y = 0; y < SIZE; y++) col.push(matrix[y][x]);
      checkPattern(col);
    }

    let dark = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (matrix[y][x]) dark++;
      }
    }
    const percent = (dark * 100) / (SIZE * SIZE);
    penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return penalty;
  }

  function buildMatrix(text) {
    const codewords = buildCodewords(text);
    const baseMatrix = createMatrix();
    const reserved = createMatrix().map(row => row.map(() => false));
    drawFunctionPatterns(baseMatrix, reserved);

    let best = null;
    let bestMask = 0;

    for (let mask = 0; mask < 8; mask++) {
      const matrix = cloneMatrix(baseMatrix);
      const maskFn = (x, y, bit) => maskValue(mask, x, y, bit);
      placeData(matrix, reserved, codewords, maskFn);
      placeFormatInfo(matrix, reserved, mask);
      const penalty = scoreMatrix(matrix);
      if (!best || penalty < best.penalty) {
        best = { matrix, penalty };
        bestMask = mask;
      }
    }

    return { matrix: best.matrix, mask: bestMask };
  }

  function matrixToSvg(matrix, options = {}) {
    const moduleSize = options.moduleSize || 12;
    const quietZone = options.quietZone || 4;
    const size = matrix.length + quietZone * 2;
    const px = size * moduleSize;
    const dark = options.dark || "#17211b";
    const light = options.light || "#ffffff";

    let rects = "";
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix.length; x++) {
        if (!matrix[y][x]) continue;
        rects += `<rect x="${x + quietZone}" y="${y + quietZone}" width="1" height="1" fill="${dark}"/>`;
      }
    }

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code">`,
      `<rect width="100%" height="100%" fill="${light}"/>`,
      rects,
      `</svg>`,
    ].join("");
  }

  function buildQrSvg(text, options = {}) {
    const qrText = String(text || "");
    const { matrix } = buildMatrix(qrText);
    return matrixToSvg(matrix, options);
  }

  window.HrMailQr = {
    buildQrSvg,
  };
})();
