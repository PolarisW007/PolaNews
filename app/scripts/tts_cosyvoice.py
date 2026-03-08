#!/usr/bin/env python3
"""CosyVoice TTS bridge script for Node.js integration.
Usage: python3 tts_cosyvoice.py --text "要合成的文字" --voice longshu --output /path/to/output.mp3
"""
import os
import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description='CosyVoice TTS')
    parser.add_argument('--text', required=True, help='Text to synthesize')
    parser.add_argument('--voice', default='longshu', help='Voice ID')
    parser.add_argument('--output', required=True, help='Output file path')
    parser.add_argument('--model', default='cosyvoice-v3-flash', help='Model name')
    args = parser.parse_args()

    api_key = os.environ.get('DASHSCOPE_API_KEY', '')
    if not api_key:
        print('ERROR: DASHSCOPE_API_KEY not set', file=sys.stderr)
        sys.exit(1)

    try:
        import dashscope
        from dashscope.audio.tts_v2 import SpeechSynthesizer
    except ImportError:
        print('ERROR: dashscope SDK not installed. Run: pip3 install dashscope', file=sys.stderr)
        sys.exit(2)

    dashscope.api_key = api_key
    dashscope.base_websocket_api_url = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'

    try:
        synthesizer = SpeechSynthesizer(model=args.model, voice=args.voice)
        audio = synthesizer.call(args.text[:5000])

        if audio and len(audio) > 0:
            os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
            with open(args.output, 'wb') as f:
                f.write(audio)
            print(f'OK:{len(audio)}')
        else:
            print('ERROR: Empty audio result', file=sys.stderr)
            sys.exit(3)
    except Exception as e:
        print(f'ERROR: {e}', file=sys.stderr)
        sys.exit(4)

if __name__ == '__main__':
    main()
