# Connections for atlas-video

None of these is required, and none is installed for you: a command is shown, and you run it. "Tried" means it was run here, and what the test covered.

## Generate video from a prompt

### WanGP

Local generation of video from text or images, with models such as Wan and LTX. Good when you want no upload and no per-video fee, and you have a GPU.

- **Connect:** install it apart from this plugin, then add its own MCP server: `python wgp.py --mcp`.
- **Advantages:** runs on your machine, nothing leaves it, no fee per video. It has twelve tools for generating, listing models and post-processing.
- **Disadvantages:** models of many GB and a GPU. Every chat with the server on pays for its tool definitions. Its licence is a community licence, not an open-source one: read it, especially before any paid use.
- **Tried:** the server starts and lists its twelve tools. No video has been generated through it here.

### Any other generator

If it offers an MCP server or a command line, `atlas media` can use it when you name it. Before you connect a hosted one, check three things: what each video costs, whether your prompts and files leave your machine, and what its terms say about using the output.

## Make video from code

`atlas media` looks for these by itself. Install the one you want.

| tool | best for | watch out for | tried here |
|---|---|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) | HTML compositions written by an agent | its own CLI and skills to install | yes, one 47-second short; the result was not judged final |
| [Remotion](https://github.com/remotion-dev/remotion) | video written in React | its own licence: companies above a size must pay, so read it | not on a real project |
| [Manim](https://github.com/ManimCommunity/manim) | mathematical animation | a Python and LaTeX setup | not on a real project |
| Blender | checking a 3D scene by numbers | a large install | not on a real project |
