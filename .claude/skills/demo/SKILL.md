---
name: demo
description: Produce a narrated demo video of table.that tailored to a specific audience or use case. Uses Playwright to capture real app screenshots, edge-tts for voice narration, and ffmpeg to assemble the final MP4.
---

# Demo Video Producer

## Arguments
$ARGUMENTS — required: a description of who the video is for and what use case to showcase. Examples:
- "real estate developer tracking investment properties"
- "recruiter managing candidate pipeline"
- "small business owner comparing vendors"
- "student organizing grad school applications"

## Instructions

You are producing a 60-120 second narrated demo video of table.that. The video shows real app screenshots with professional voiceover narration, tailored to the audience described in the arguments.

### Tools and paths

```
FFMPEG = r"C:\Users\cliff\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe"
MAGICK = r"C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"
VOICE  = "en-US-AndrewMultilingualNeural"
```

- edge-tts: `python -m edge_tts` or `import edge_tts` for TTS audio generation
- Playwright MCP: browser_navigate, browser_click, browser_type, browser_take_screenshot, etc.
- Output directory: `_demo/` (frames in `_demo/frames/`, audio in `_demo/audio/`)
- Production URL: https://tablethat.ironcliff.ai
- Dev URL: http://192.168.0.12:5173

### Step 1: Write the storyboard

Based on the target audience, write a storyboard with 8-10 scenes. Each scene has:
- **frame**: what to screenshot (which page/state of the app)
- **narration**: what the voiceover says (2-3 sentences max, conversational tone)

The standard flow is:
1. Landing page — introduce table.that
2. Registration — show how quick signup is
3. Dashboard — empty state, ready to build
4. Chat prompt — user types their specific request (tailored to the audience!)
5. Schema proposal — AI designs the table
6. Table created — empty table with columns and filters
7. Data proposal — AI generates sample data relevant to the use case
8. Table with data — the populated table (hero shot)
9. Filtered view — show filtering in action
10. Closing slide — "tablethat.ironcliff.ai"

**Tailor the chat prompt and narration to the audience.** A recruiter demo should ask about tracking candidates. A student demo should ask about grad school applications. The data the AI generates will naturally match the prompt.

### Step 2: Capture screenshots

Use Playwright MCP to navigate the app (dev URL) and capture each scene:

1. Set browser to 1280x720: `browser_resize(1280, 720)`
2. Make sure light mode is active (check for dark background, toggle if needed)
3. Log out if currently logged in
4. Navigate through the flow, capturing screenshots to `_demo/frames/XX_name.png`
5. For the chat interaction: type the audience-specific prompt, send it, wait for AI response
6. Wait adequate time for AI responses (15-20 seconds after sending a message)

**Important:**
- Use `browser_take_screenshot` with absolute paths in `_demo/frames/`
- Register a new throwaway account for each video (e.g., `demo-{usecase}@table.that`)
- After creating the table, hide the chat panel for clean table screenshots
- Capture a filtered view to show interactivity

### Step 3: Build the video

Use the build script at `_demo/build_video.py` as a reference, but update it with the new storyboard. The key steps:

1. **Generate audio**: Use edge-tts with the Andrew Multilingual voice to create MP3 for each scene
2. **Create closing frame**: Use ImageMagick to create a dark closing slide with "table.that" and "tablethat.ironcliff.ai"
3. **Assemble with ffmpeg**: Stitch frames + audio into MP4. Each frame displays for the duration of its audio clip + 0.8s padding.

You can either:
- Update `_demo/build_video.py` with the new SCENES array and run it
- Or write a new script for this specific video

### Step 4: Report

Tell the user:
- Where the video file is
- Duration and file size
- What scenes are included
- Offer to tweak narration, swap scenes, or adjust timing

### Voice guidelines

- Keep narration conversational, not salesy
- Use "table dot that" when speaking the product name (TTS pronounces it correctly)
- Refer to the production URL as "table that dot ironcliff dot A I" in speech
- 2-3 sentences per scene max — let the visuals do the work
- Tailor language to the audience (a developer hears "schema", a small business owner hears "columns")

### Output

Final video: `_demo/table-that-demo.mp4` (overwrite previous, or name it `_demo/table-that-demo-{usecase}.mp4` if the user wants to keep multiple)
