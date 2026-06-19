const minecraftCommand = require("../../contracts/minecraftCommand.js");

class PickCommand extends minecraftCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "pick";
    this.aliases = ["choose", "decide"];
    this.description = "Pick one option randomly.";
    this.options = [
      {
        name: "options",
        description: "Options to pick from. Example: mango or emerald",
        required: true
      }
    ];
  }

  /**
   * @param {string} player
   * @param {string} message
   */
  async onCommand(player, message) {
    try {
      const input = this.getArgs(message).join(" ").trim();

      if (!input) {
        throw "You must provide at least two options.";
      }

      const options = this.parseOptions(input);

      if (options.length < 2) {
        throw "You must provide at least two options. Example: !pick mango emerald";
      }

      const picked = options[Math.floor(Math.random() * options.length)];

      const responses = [
        `I pick ${picked}. No takebacks.`,
        `The universe has spoken: ${picked}.`,
        `After way too much thinking, I choose ${picked}.`,
        `Clearly the best option is ${picked}.`,
        `My very professional decision is: ${picked}.`,
        `Against all odds, it has to be ${picked}.`,
        `Easy choice: ${picked}.`,
        `Today feels like a ${picked} kind of day.`,
        `I would explain why, but the answer is simply ${picked}.`,
        `Statistically speaking... nah, just pick ${picked}.`,
        `My totally unbiased pick is ${picked}.`,
        `The correct answer is obviously ${picked}.`,
        `No pressure, but destiny chose ${picked}.`
      ];

      const response = responses[Math.floor(Math.random() * responses.length)];

      this.send(response);
    } catch (error) {
      this.send(`[ERROR] ${error}`);
    }
  }

  /**
   * Supports:
   * !pick mango emerald
   * !pick mango or emerald
   * !pick mango smoothie or emerald blade
   * !pick "mango smoothie" emerald
   * !pick mango, emerald; banana | apple
   *
   * @param {string} input
   * @returns {string[]}
   */
  parseOptions(input) {
    const tokens = this.tokenize(input);

    const separatorWords = ["or", "oder", "vs", "versus"];
    const separatorChars = [",", ";", "|"];

    const hasExplicitSeparator = tokens.some(token =>
      token.type === "separator" ||
      separatorWords.includes(token.value.toLowerCase())
    );

    // If there is no separator, every token is its own option.
    // Quoted strings stay together.
    if (!hasExplicitSeparator) {
      return tokens
        .filter(token => token.type === "word")
        .map(token => token.value.trim())
        .filter(Boolean);
    }

    const options = [];
    let current = [];

    for (const token of tokens) {
      const isSeparator =
        token.type === "separator" ||
        separatorWords.includes(token.value.toLowerCase());

      if (isSeparator) {
        const option = current.join(" ").trim();

        if (option) {
          options.push(option);
        }

        current = [];
        continue;
      }

      current.push(token.value);
    }

    const lastOption = current.join(" ").trim();

    if (lastOption) {
      options.push(lastOption);
    }

    return [...new Set(options)].filter(Boolean);
  }

  /**
   * Tokenizer that keeps quoted text together.
   *
   * @param {string} input
   * @returns {{ type: "word" | "separator", value: string }[]}
   */
  tokenize(input) {
    const tokens = [];
    let current = "";
    let quote = null;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (quote) {
        if (char === quote) {
          if (current.trim()) {
            tokens.push({
              type: "word",
              value: current.trim()
            });
          }

          current = "";
          quote = null;
        } else {
          current += char;
        }

        continue;
      }

      if (char === '"' || char === "'") {
        if (current.trim()) {
          tokens.push({
            type: "word",
            value: current.trim()
          });
        }

        current = "";
        quote = char;
        continue;
      }

      if (char === "," || char === ";" || char === "|") {
        if (current.trim()) {
          tokens.push({
            type: "word",
            value: current.trim()
          });
        }

        current = "";
        tokens.push({
          type: "separator",
          value: char
        });
        continue;
      }

      if (/\s/.test(char)) {
        if (current.trim()) {
          tokens.push({
            type: "word",
            value: current.trim()
          });
        }

        current = "";
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      tokens.push({
        type: "word",
        value: current.trim()
      });
    }

    return tokens;
  }
}

module.exports = PickCommand;