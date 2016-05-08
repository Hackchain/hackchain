# Hackchain
[![NPM version](https://badge.fury.io/js/hackchain.svg)](http://badge.fury.io/js/hackchain)

**Alpha version**

Continuous bitcoin-inspired capture-the-flag challenge.

## Preamble

A [hackchain server][0] was running in a cloud. Some hacker has installed the
client for it:

```bash
$ npm install -g hackchain
```

Hacker has also requested a server info:

```bash
$ hc-client --info
{ lastBlock: '4e9c8600ca954bbfd88a1ca8715e5cf5a751a8e5945802912086e632bec85e1f',
  nextBlockIn: 17,
  nextCoinbaseIn: 85817,
  'proof-of-work-complexity': 17 }

$ hc-client --leaderboard
===== Current top transactions =====
NOTE: It is important to use both hash and index to steal a transaction
[ { hash: '61d9faa5dc429c8eb4f00835f285b3a5f7022f8b557432a7af542d0b778bc14e',
    index: 4,
    value: '1500000000' },
    ... ]
```

"I wonder if I can capture some of these coins...", she thought.

## Description for Hackers

The server is running bitcoin-like blockchain with the main difference that the
blocks are issued automatically every 5 minutes. One may request the latest
block hash either by using `--info` argument of the `hc-client`, or by running:

```bash
curl https://api.hackcha.in/
```

The whole point of this "continuous CTF challenge" is to capture someone else's
coins and protect them. It is very close to [CTF challenges][1], but
participants compete with each other instead of attacking some predefined
software.

New coins are minted only once every 24 hours, so hackers are encouraged to
steal coins from each other. Current leaderboard (list of unspent coins) can be
found by using `--leaderboard` argument of `hc-client`, or by running:

```bash
curl https://api.hackcha.in/leaderboard
```

Being very similar in structure to bitcoin blockchain, hackchain provides an
opportunity to learn about bitcoin internals, and most importantly have some
fun!

While recommended to read in order, one may skip all sections except
[Capturing](#capturing), where the process of capturing (stealing) coins is
described in detail.

### Community

Feel free to join [#hackchain][9] IRC channel on [freenode server][10] to
discuss things with other hackers.

### Block

Blocks have a link to the parent block (or a genesis block with the hash
`0000000....`, all zeroes), and a list of at least one transaction (TX). First
TX in a block is called a coinbase and (in contrast to bitcoin) can be spent
by anyone, unless its output value is `0`.

Block may be inspected using `--block <hash>` argument of the `hc-client`:
```
<Block: b1e6483...
   parent: 6017999...
   txs: [ <Coinbase: 735c742...
      v=1
      inputs: [ <Input hash: 6017999...
          index: -1
          script: <Script len: 0
          opcodes: [
    ]>> ]
      outputs: [ <Output value: 2500000000
          script: <Script len: 2
          opcodes: [
    irq success]>> ]> ]>
```

Raw hex data may be fetched by running:

```bash
curl https://api.hackcha.in/v1/block/<hash>
```

Spec for the binary encodings of all structures is available below.

### TX

Every transaction has at least one input and output.

Each input has a `hash` of input TX, `index` of output in that TX, and `script`
to capture it. (See ["Capturing" section](#capturing) below).

Each output has a `value` number of coins, and `script` to prevent capturing
these coins.

TX cannot spend more coins than it gets from the inputs, but it can spend less.
The difference is called `fee` and is added to the coinbase of the block where
TX is stored.

TX may be inspected using `--tx <hash>` argument of the
`hc-client`:

```
<TX: 10319ac...
    v=1
    inputs: [ <Input hash: 699eb0e...
        index: 0
        script: <Script len: 8
        opcodes: [
  lui r1 64
  addi r1 r1 0
  sw r0 r1 8
  irq success]>> ]
    outputs: [ <Output value: 2500000000
        script: <Script len: 4
        opcodes: [
  irq yield
  irq success]>> ]>
```

Raw hex data may be inspected by running:

```bash
curl https://api.hackcha.in/v1/tx/<hash>
```

### Capturing

In order to capture someone's coin (or coinbase), the attacker must implement an
input script that will be able to defeat the output script of the TX.

Scripts are written is [RiSC-16][2] (Ridiculously Simple Computer) instruction
set and are running in a shared memory space of 0x10000 16-bit words. Yes, you
read it right, the code is living in the same space, and the scripts are allowed
to modify each other.

The process:

1. Spending TX (the one that you sent) hash is loaded to `0x0` offset of the
   memory
2. `output` script is loaded to `0x1000` offset of the memory and executed
   until `irq yield`/`irq success`, or until it executes more than
   `100 * 1024` opcodes (if so - coin is captured, and further steps are
   skipped)
3. If `irq success` was executed in step 2 - coin is captured and the process
   ends. If `irc yield` was executed - proceed to step 4
4. `input` script is loaded to `0x2000` offset of the memory
5. One opcode of `output` is executed
6. If any `irq ...` was executed - the process ends with captured coin
7. One opcode of `input` is executed
8. If any `irq ...` was executed - steps 7-8 are replaced by `no op`
9. If number of opcodes executed in `output` after step 4 exceeds `1024 * 1024`
   - process terminates, and coin is not captured

### Scripts

Quoting [RiSC-16][2], there are 8 different 16-bit registers (`r0`, ..., `r7`),
and 10 different instructions:

- `add rA, rB, rC` - Add contents of regB with regC, store result in regA
- `addi rA, rB, imm` - Add contents of regB with imm, store result in regA
- `nand rA, rB, rC` - Nand contents of regB with regC, store results in regA
- `lui rA, imm` - Place the 10 ten bits of the 16-bit imm into the 10 ten bits
  of regA, setting the bottom 6 bits of regA to zero
- `sw rA, rB, imm` - Store value from regA into memory. Memory address is formed
  by adding imm with contents of regB
- `lw rA, rB, imm` - Load value from memory into regA. Memory address is formed
  by adding imm with contents of regB
- `beq rA, rB, imm` - If the contents of regA and regB are the same, branch to
  the address PC+1+imm, where PC is the address of the beq instruction
- `jalr rA, rB` - Branch to the address in regB. Store PC+1 into regA, where PC
  is the address of the jalr instruction.

They are encoded just as they are described in [a paper][2].

Additional opcodes are added in hackchain:

- `irq success` - terminate thread (see [capturing](#capturing) too), encoded
  as `0xe001` word in big endian
- `irq yield` - yield execution to input script (see
  [step 2 above](#capturing)), encoded as `0xe081` word in big endian

NOTE: Reading value of `r0` always returns `0` for your convenience!

Additional opcode-combos are available using the assembler in this repo:

- `jmp label-name` - generate short (within 64 opcodes) relative jump to the
  specified label
- `farjmp rA, label-name` - generate far absolute jump to the specified label.
  NOTE: `rA` register will be overwritten to store the absolute offset
- `bind label-name` - bind specified label to the current opcode offset
- `lea rA, label-name` - load label's absolute address into the `rA` register
- `codeOffset <16-bit offset>` - change code offset. Absolutely needed when
  using `farjmp` in code that doesn't start at `0x0000` memory offset
- `movi rA, <16-bit immediate>` - will generate two opcodes `lui` nd `addi`
- `nop` - will generate `add r0, r0, r0`
- `data 0xabcd` - put the raw 16-bit word instead of an instruction

Examples:

  * [advanced RiSC-16 coding][5]
  * [fighting scripts][6], see [section](#spending-tx-with-hc-client) below

### Spending TX with hc-client

[![asciicast](https://asciinema.org/a/44859.png)](https://asciinema.org/a/44859)

It is possible to generate and send TX using `hc-client`. In order to do this,
a yaml-formatted `tx-name.tx` file must be created:

```yaml
version: 1
inputs:
  - hash: 'a1dd41f1efd2498dd8126684fe164d22d6188046b1c71a7d5325c2158965237b'
    index: 0
    script:
      - irq success
outputs:
  - value: '2500000000'
    script:
      - irq yield
      - irq success
```

(See [examples/][7] for more various TX examples)

NOTE: `script` arrays have string values. `,` or ` ` separators may be used
between opcode and arguments, and between arguments. Arguments are either:

* `rN` - register input/output, where `N` is a number from `0` to `7`
* `N` - immediate value, where `N` is a decimal integer
  (either positive or negative)
* `string` - anything that does not fit into one of two bullet points above.
  Usually used in `irq` opcodes (`irq success`, `irq yield`).

Afterwards, one may execute:

```bash
$ hc-client --spend tx-name.tx
```

It will parse file, generate TX, confirm it, and send it to server. If the
server will accept the TX, the confirmation will be printed. If the server will
reject the TX, a (hopefully) meaningful error message will be printed.

NOTE: While TXs are accepted immediately, they are not available for spending
until the server will mint a new block. Please check output of
`hc-client --info` to get the time until the next block.

### Debugger

[![asciicast](https://asciinema.org/a/44862.png)](https://asciinema.org/a/44862)

While some scripts may be easy to follow, others may definitely require more
detailed investigation. This is where internal debugger may come out handy:

```
$ hc-debug examples/debugger/prog1.yaml
```

NOTE: `yaml` file with the contents of both scripts and TX hash, must be
supplied to debugger. See [debugger examples][8]

### Binary Format

All values are in [Big Endian][4].

#### Block

```
[ 32-bit number ] version
[ 32 bytes      ] parent sha256 hash
[ 32-bit number ] TX count
...               TXs
```

#### TX

```
[ 32-bit number ] version
[ 32-bit number ] input count
[ 32-bit number ] output count
...               inputs
...               outputs
```

#### Input

```
[ 32 bytes      ] sha256 hash of input TX
[ 32-bit number ] input index
...               script
```

#### Output

```
[ 8 bytes       ] big endian big number
...               script
```

#### Script

```
[ 32-bit number ] size of binary data below
...               binary opcodes for RiSC-16
```

### Additional Server endpoints

```
$ curl https://api.hackcha.in/help | jq .
{
  "/": "information about server and last block",
  "/help": "this message",
  "/leaderboard": "list of currently unspent transactions",
  "/v1/block/(hash)": "GET block data",
  "/v1/tx/(hash)": "GET/POST transaction data",
  "/v1/tx/(hash)/block": "GET the hash of transaction's block",
  "/v1/tx/(hash)/(output index)/spentby": "GET the hash of spending tx"
}
```

### Bugs

If any bugs, please [file an issue][3]. We will make sure to figure it out!

#### LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2016.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.

[0]: https://api.hackcha.in/
[1]: https://en.wikipedia.org/wiki/Capture_the_flag#Computer_security
[2]: http://www.eng.umd.edu/~blj/RiSC/RiSC-isa.pdf
[3]: https://github.com/hackchain/hackchain-core/issues
[4]: https://en.wikipedia.org/wiki/Endianness
[5]: http://www.johnloomis.org/ece449/notes/Jacob/ex-5.html
[6]: https://github.com/hackchain/hackchain-core/blob/d46b2a580f5413f5419298fc5dbf59b15562f562/test/interpreter/interpreter-test.js#L84-L103
[7]: https://github.com/hackchain/hackchain-client/blob/master/examples/
[8]: https://github.com/hackchain/hackchain-debugger/blob/master/examples/
[9]: http://webchat.freenode.net?channels=%23hackchain&uio=d4
[10]: https://freenode.net/
