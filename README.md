# Hackchain

**Alpha version**

Continuous bitcoin-inspired hackaton.

## Preamble

A [hackchain server][0] was running in a cloud. Some hacker has installed the
client for it:

```bash
$ npm install -g hackchain
```

Hacker has also requested a server info:

```bash
$ hc-client -s https://api.hackchain.darksi.de/ --info
{ version: '1.0.0',
  lastBlock: '0970f19e074abbb879adde0fecdbf67d558b99f8b5574bfe20776a122ff68f8c',
  nextBlockIn: 159 }

$ hc-client -s https://api.hackchain.darksi.de/ \
    --block 0970f19e074abbb879adde0fecdbf67d558b99f8b5574bfe20776a122ff68f8c
<Block: ...
  ....>
```

"I wonder if I can capture some coins from this block...", she thought.

## Description for Hackers

The server is running bitcoin-like blockchain with the main difference that the
blocks are issued automatically every 5 minutes. One may request the latest
block hash either by using `--info` argument of the `hc-client`, or by running:

```bash
curl https://api.hackchain.darksi.de/
```

The whole point of this "continuous hackathon" is to capture someone else's
coins and protect them. It is very close to [CTF challenges][1], but
participants compete with each other instead of attacking some predefined
software.

### Block

Blocks have a link to the parent block (or a genesis block with the hash
`0000000....`, all zeroes), and a list of at least one transaction (TX). First
TX in a block is called a coinbase and (in contrast to bitcoin) can be spent
by anyone.

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
curl https://api.hackchain.darksi.de/v1/block/<hash>
```

Spec for the binary encodings of all structures is available below.

### TX

Every transaction has at least one input and output.

Each input has a `hash` of input TX, `index` of output in that TX, and `script`
to capture it. (See "Capture" section below).

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
curl https://api.hackchain.darksi.de/v1/tx/<hash>
```

### Capturing

In order to capture someone's coin (or coinbase), the attacker must implement an
input script that will be able to defeat the output script of the TX.

Scripts are written is [RiSC-16][3] (Ridiculously Simple Computer) instruction
set and are running in a shared memory space of 0x10000 16-bit words. Yes, you
read it right, the code is living in the same space, and the scripts are allowed
to modify each other.

The process:

1. Spending TX (the one that you wrote) has is loaded to `0x0` offset of the
   memory
2. `output` script is loaded to `0x1000` offset of the memory and executed
   until `irq yield`/`irq success`/`irq failure`, or until it executes more than
   `100 * 1024` opcodes (if so - coin is captured, and further steps are
   skipped)
3. If `irq success` was executed in step 2 - coin is captured and the process
   ends. If `irq failure` was executed in step 2 - coin is not captured and the
   process ends. If `irc yield` was executed - proceed to step 4
4. `input` script is loaded to `0x2000` offset of the memory
5. One opcode of `output` is executed
6. If any `irq ...` was executed - the process ends with either captured or
   not captured coin (see step 3)
7. One opcode of `input` is executed
8. If any `irq ...` was executed - step 7 is replaced by `no op`
9. If number of opcodes executed in `output` after step 4 excdeeds `1024 * 1024`
   - process terminates, and coin is not captured

### Scripts

Quoting [RiSC-16][2], there are 8 different 16-bit registers (`r0`, ..., `r7`),
and 8 different instructions:

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

NOTE: Reading value of `r0` always returns `0` for your convenience!

Additional opcode-combos are available using the assembler in this repo:

- `movi rA, 16-bit immediate` - will generate two opcodes `lui` nd `addi`

### Spending TX with hc-client

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
$ curl https://api.hackchain.darksi.de/help | jq .
{
  "/": "information about server and last block",
  "/help": "this message",
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

[0]: https://api.hackchain.darksi.de/
[1]: https://en.wikipedia.org/wiki/Capture_the_flag#Computer_security
[2]: http://www.eng.umd.edu/~blj/RiSC/RiSC-isa.pdf
[3]: https://github.com/indutny/hackchain/issues
[4]: https://en.wikipedia.org/wiki/Endianness
