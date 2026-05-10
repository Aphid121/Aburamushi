import click
import os
import zipfile
import tempfile
import json
import shutil
import cv2
import numpy as np
from pathlib import Path
from PIL import ImageFont
from sudachipy import dictionary, tokenizer
import requests
import base64

import sys
import torch
sys.path.append(os.path.join(os.path.dirname(__file__), 'comic-text-detector'))
from inference import TextDetector
from utils.textmask import REFINEMASK_ANNOTATION

class MangaOCRExtractor:
    def __init__(self):
        click.echo("[*] Using KCPP VLM...")

    def extract_text(self, image_path):
        try:
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            
            payload = {
                "max_context_length": 16384,
                "max_length": 1024,
                "temperature": 0.0,
                "images": [encoded_string],
                "prompt": "<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n<|image_1|>\nExtract the Japanese text from this image. EXPLICITLY IGNORE furigana (ruby characters). Output ONLY the text as written verbatim, do not add quotation marks or any other formatting.<|im_end|>\n<|im_start|>assistant\n"
            }
            
            response = requests.post("http://localhost:5001/api/v1/generate", json=payload)
            response.raise_for_status()
            res = response.json()['results'][0]['text']
            click.echo(f"    [VLM Response] {res}")
            
            try:
                # Try to parse as JSON first
                parsed = json.loads(res)
                if isinstance(parsed, list) and len(parsed) > 0:
                    text = parsed[0].get("text_content", "")
                elif isinstance(parsed, dict):
                    text = parsed.get("text_content", parsed.get("text", ""))
                else:
                    text = res
            except json.JSONDecodeError:
                # If it's wrapped in markdown code blocks, try to extract it
                if "```json" in res:
                    try:
                        json_str = res.split("```json")[1].split("```")[0].strip()
                        parsed = json.loads(json_str)
                        if isinstance(parsed, list) and len(parsed) > 0:
                            text = parsed[0].get("text_content", "")
                        elif isinstance(parsed, dict):
                            text = parsed.get("text_content", parsed.get("text", ""))
                        else:
                            text = res
                    except:
                        text = res
                else:
                    text = res
                    
            # Clean up <think> tags from Qwen models
            if "<think>" in text and "</think>" in text:
                text = text.split("</think>")[-1].strip()
                
            return text.replace(' ', '').replace('\n', '').replace('　', '')
        except Exception as e:
            click.echo(f"    [!] Error extracting text: {e}")
            return ""

class YOLOBoxer:
    def __init__(self):
        click.echo("[*] Loading comic-text-detector...")
        model_path = os.path.join(os.path.dirname(__file__), 'comictextdetector.pt')
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model = TextDetector(model_path=model_path, input_size=1024, device=device, act='leaky')

    def find_bubbles(self, img):
        mask, mask_refined, blk_list = self.model(img, refine_mode=REFINEMASK_ANNOTATION, keep_undetected_mask=True)
        if mask_refined is None:
            return [], None
            
        if mask_refined.max() <= 1:
            mask_img = (mask_refined * 255).astype(np.uint8)
        else:
            mask_img = mask_refined.astype(np.uint8)
            
        return blk_list, mask_img

class JapaneseTokenizer:
    def __init__(self):
        click.echo("[*] Initializing SudachiPy tokenizer...")
        self.tokenizer_obj = dictionary.Dictionary().create()
        self.mode = tokenizer.Tokenizer.SplitMode.C

    def tokenize(self, text):
        tokens = self.tokenizer_obj.tokenize(text, self.mode)
        result = []
        for t in tokens:
            result.append({
                "text": t.surface(),
                "base_form": t.dictionary_form(),
                "reading": t.reading_form(),
                "part_of_speech": t.part_of_speech()[0]
            })
        return result

def extract_archive(input_path, temp_dir):
    input_path_obj = Path(input_path)
    image_files = []
    
    if input_path_obj.is_file() and input_path_obj.suffix.lower() in ['.zip', '.cbz']:
        click.echo(f"[*] Unzipping archive: {input_path_obj.name}")
        with zipfile.ZipFile(input_path_obj, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
    elif input_path_obj.is_dir():
        click.echo(f"[*] Copying directory: {input_path_obj.name}")
        shutil.copytree(input_path_obj, temp_dir, dirs_exist_ok=True)
    elif input_path_obj.is_file() and input_path_obj.suffix.lower() in ['.jpg', '.jpeg', '.png', '.bmp']:
        click.echo(f"[*] Processing single image: {input_path_obj.name}")
        shutil.copy2(input_path_obj, Path(temp_dir) / input_path_obj.name)
    else:
        raise click.BadParameter("Invalid input format.")
        
    valid_exts = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
    for root, _, files in os.walk(temp_dir):
        for file in files:
            if Path(file).suffix.lower() in valid_exts:
                image_files.append(Path(root) / file)
                
    image_files.sort()
    return image_files

@click.command()
@click.argument('input_path', type=click.Path(exists=True))
@click.option('--output', '-o', default=None, help='Output .abms file path')
def process_manga(input_path, output):
    click.echo(f"[*] Starting Aburamushi Preprocessor...")
    
    input_path_obj = Path(input_path)
    if not output:
        output = str(input_path_obj.with_suffix('.abms'))
        
    try:
        vlm_extractor = MangaOCRExtractor()
        yolo_boxer = YOLOBoxer()
        jp_tokenizer = JapaneseTokenizer()
    except Exception as e:
        click.echo(f"[!] Failed to load models: {e}")
        return

    font_path = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
    if not os.path.exists(font_path):
        font_path = "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"
    font = ImageFont.truetype(font_path, 20)

    manga_data = {"pages": []}

    with tempfile.TemporaryDirectory() as temp_dir:
        click.echo(f"[*] TEMP_DIR: {temp_dir}")
        images = extract_archive(input_path, temp_dir)
        click.echo(f"[*] Found {len(images)} images to process.")
        
        json_path = Path(temp_dir) / "aburamushi.json"
        
        for img_path in images:
            click.echo(f"[*] Processing {img_path.name}...")
            img = cv2.imread(str(img_path))
            if img is None: continue
            
            h, w = img.shape[:2]
            
            scale_small = min(400 / w, 400 / h)
            scale_medium = min(1000 / w, 1000 / h)
            
            small_filename = f"small_{img_path.name}"
            medium_filename = f"medium_{img_path.name}"
            
            if scale_small < 1:
                img_small = cv2.resize(img, (int(w * scale_small), int(h * scale_small)), interpolation=cv2.INTER_LANCZOS4)
            else:
                img_small = img
                
            if scale_medium < 1:
                img_medium = cv2.resize(img, (int(w * scale_medium), int(h * scale_medium)), interpolation=cv2.INTER_LANCZOS4)
            else:
                img_medium = img
                
            cv2.imwrite(str(Path(temp_dir) / small_filename), img_small)
            cv2.imwrite(str(Path(temp_dir) / medium_filename), img_medium)
            
            page_data = {
                "image": img_path.name,
                "image_small": small_filename,
                "image_medium": medium_filename,
                "width": w,
                "height": h,
                "bubbles": []
            }
            blk_list, mask_img = yolo_boxer.find_bubbles(img)
            
            if mask_img is None: continue
            
            _, full_processed_mask = cv2.threshold(mask_img, 50, 255, cv2.THRESH_BINARY)
            
            for b_idx, blk in enumerate(blk_list):
                xmin, ymin, xmax, ymax = map(int, blk.xyxy)
                w = xmax - xmin
                h = ymax - ymin
                is_vertical = h > w
                direction = "vertical-rl" if is_vertical else "horizontal-lr"
                
                bubble_mask = mask_img[ymin:ymax, xmin:xmax]
                _, processed_mask = cv2.threshold(bubble_mask, 50, 255, cv2.THRESH_BINARY)
                contours, _ = cv2.findContours(processed_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                raw_boxes = []
                for cnt in contours:
                    cx, cy, cw, ch = cv2.boundingRect(cnt)
                    if cw > 2 and ch > 2:
                        raw_boxes.append([cx + xmin, cy + ymin, cw, ch])
                        
                if not raw_boxes: continue
                
                # Detect and filter furigana (ruby characters) based on box size and position
                max_w = max(b[2] for b in raw_boxes)
                max_h = max(b[3] for b in raw_boxes)
                main_boxes = [b for b in raw_boxes if b[2] > max_w * 0.5 or b[3] > max_h * 0.5]
                if not main_boxes: main_boxes = raw_boxes
                    
                filtered_raw_boxes = []
                if is_vertical:
                    axis_center = np.mean([b[0] + b[2]/2 for b in main_boxes])
                    for b in raw_boxes:
                        bcx = b[0] + b[2]/2
                        if b[2] < max_w * 0.6 and b[3] < max_h * 0.6 and bcx > axis_center + max_w * 0.2:
                            pass # Furigana
                        else:
                            filtered_raw_boxes.append(b)
                else:
                    axis_center = np.mean([b[1] + b[3]/2 for b in main_boxes])
                    for b in raw_boxes:
                        bcy = b[1] + b[3]/2
                        if b[2] < max_w * 0.6 and b[3] < max_h * 0.6 and bcy < axis_center - max_h * 0.2:
                            pass # Furigana
                        else:
                            filtered_raw_boxes.append(b)
                            
                raw_boxes = filtered_raw_boxes
                refined_lines = []
                
                # Group raw bounding boxes into columns using comic-text-detector line polygons
                column_boxes = []
                for line_poly in blk.lines:
                    pts = np.array(line_poly, np.int32)
                    lx, ly, lw, lh = cv2.boundingRect(pts)
                    
                    line_raw_boxes = []
                    for rx, ry, rw, rh in raw_boxes:
                        rcx = rx + rw/2
                        rcy = ry + rh/2
                        if lx <= rcx <= lx + lw and ly <= rcy <= ly + lh:
                            line_raw_boxes.append([rx, ry, rw, rh])
                            
                    if line_raw_boxes:
                        min_x = min(b[0] for b in line_raw_boxes)
                        min_y = min(b[1] for b in line_raw_boxes)
                        max_x = max(b[0]+b[2] for b in line_raw_boxes)
                        max_y = max(b[1]+b[3] for b in line_raw_boxes)
                        column_boxes.append([min_x, min_y, max_x - min_x, max_y - min_y])
                        
                # Merge column boxes that overlap on the primary text axis
                def boxes_overlap(b1, b2):
                    x1, y1, w1, h1 = b1
                    x2, y2, w2, h2 = b2
                    # For columns, we only care about overlap in the primary axis
                    # If it's vertical text, columns are side-by-side, so they overlap if their X coordinates overlap
                    # If it's horizontal text, columns are stacked, so they overlap if their Y coordinates overlap
                    if is_vertical:
                        # Check X overlap
                        if x1 >= x2 + w2 or x2 >= x1 + w1:
                            return False
                        return True
                    else:
                        # Check Y overlap
                        if y1 >= y2 + h2 or y2 >= y1 + h1:
                            return False
                        return True
                    
                def merge_boxes(b1, b2):
                    x1, y1, w1, h1 = b1
                    x2, y2, w2, h2 = b2
                    nx = min(x1, x2)
                    ny = min(y1, y2)
                    nw = max(x1 + w1, x2 + w2) - nx
                    nh = max(y1 + h1, y2 + h2) - ny
                    return [nx, ny, nw, nh]
                    
                merged_columns = []
                for box in column_boxes:
                    merged = False
                    for i, m_box in enumerate(merged_columns):
                        if boxes_overlap(box, m_box):
                            merged_columns[i] = merge_boxes(box, m_box)
                            merged = True
                            break
                    if not merged:
                        merged_columns.append(box)
                        
                final_columns = []
                while merged_columns:
                    current_box = merged_columns.pop(0)
                    i = 0
                    while i < len(merged_columns):
                        if boxes_overlap(current_box, merged_columns[i]):
                            current_box = merge_boxes(current_box, merged_columns[i])
                            merged_columns.pop(i)
                            i = 0
                        else:
                            i += 1
                    final_columns.append(current_box)
                    
                for col_box in final_columns:
                    min_x, min_y, cw, ch = col_box
                    max_x = min_x + cw
                    max_y = min_y + ch
                    
                    # Perform raycasting to refine column boundaries based on the processed mask
                    char_size = (max_x - min_x) if is_vertical else (max_y - min_y)
                    if char_size <= 0: char_size = 20
                    search_dist = int(char_size * 2.0)
                    line_dist = max(3, int(char_size * 0.2))
                    
                    if is_vertical:
                        cx = int((min_x + max_x) / 2)
                        search_x_min = max(0, cx - line_dist)
                        search_x_max = min(img.shape[1], cx + line_dist + 1)
                        
                        last_text_y = min_y
                        for y in range(min_y, -1, -1):
                            if np.any(full_processed_mask[y, search_x_min:search_x_max] > 0):
                                last_text_y = y
                            elif last_text_y - y > search_dist: break
                        min_y = min(min_y, last_text_y)
                        
                        last_text_y = max_y
                        for y in range(max_y, img.shape[0]):
                            if np.any(full_processed_mask[y, search_x_min:search_x_max] > 0):
                                last_text_y = y
                            elif y - last_text_y > search_dist: break
                        max_y = max(max_y, last_text_y)
                    else:
                        cy = int((min_y + max_y) / 2)
                        search_y_min = max(0, cy - line_dist)
                        search_y_max = min(img.shape[0], cy + line_dist + 1)
                        
                        last_text_x = min_x
                        for x in range(min_x, -1, -1):
                            if np.any(full_processed_mask[search_y_min:search_y_max, x] > 0):
                                last_text_x = x
                            elif min_x - x > search_dist: break
                        min_x = min(min_x, last_text_x)
                        
                        last_text_x = max_x
                        for x in range(max_x, img.shape[1]):
                            if np.any(full_processed_mask[search_y_min:search_y_max, x] > 0):
                                last_text_x = x
                            elif x - last_text_x > search_dist: break
                        max_x = max(max_x, last_text_x)
                        
                    pad = 5
                    min_x -= pad
                    min_y -= pad
                    max_x += pad
                    max_y += pad
                    
                    refined_lines.append([min_x, min_y, max_x - min_x, max_y - min_y])
                        
                if not refined_lines: continue
                
                if is_vertical:
                    refined_lines.sort(key=lambda b: b[0] + b[2], reverse=True)
                else:
                    refined_lines.sort(key=lambda b: b[1])
                    
                pad = 20
                crop_ymin = max(0, ymin - pad)
                crop_ymax = min(img.shape[0], ymax + pad)
                crop_xmin = max(0, xmin - pad)
                crop_xmax = min(img.shape[1], xmax + pad)
                
                bubble_crop_padded = img[crop_ymin:crop_ymax, crop_xmin:crop_xmax]
                temp_path = f"/tmp/mocr_temp_{b_idx}.jpg"
                cv2.imwrite(temp_path, bubble_crop_padded)
                
                bubble_text = vlm_extractor.extract_text(temp_path)
                if not bubble_text: continue
                
                # Tokenize the entire bubble text first
                bubble_tokens = jp_tokenizer.tokenize(bubble_text)
                
                total_line_length = sum(b[3] if is_vertical else b[2] for b in refined_lines)
                all_char_sizes = []
                for char in bubble_text:
                    # Use getmask().getbbox() to get the actual pixel dimensions of the character's ink
                    mask = font.getmask(char)
                    bbox = mask.getbbox()
                    
                    if bbox:
                        char_w = bbox[2] - bbox[0]
                        char_h = bbox[3] - bbox[1]
                        
                        # For brackets and long vowel marks in vertical text, 
                        # they are rotated 90 degrees, so we should use their width as their height
                        if is_vertical and char in '()（）「」『』【】ー—~～…':
                            char_h = char_w
                    else:
                        # Fallback for whitespace or empty characters
                        char_w = font.size * 0.5
                        char_h = font.size * 0.5
                        
                    # Add a small base padding so very thin characters don't disappear
                    size = (char_h if is_vertical else char_w) + font.size * 0.2
                    all_char_sizes.append(size)
                    
                total_char_size = sum(all_char_sizes)
                line_intervals = []
                curr_len = 0
                for bounds in refined_lines:
                    l_len = bounds[3] if is_vertical else bounds[2]
                    line_intervals.append((curr_len, curr_len + l_len))
                    curr_len += l_len
                    
                line_assignments = [[] for _ in refined_lines]
                current_char_pos = 0
                scale = total_line_length / total_char_size if total_char_size > 0 else 1
                
                prev_assigned_line = 0
                char_idx = 0
                
                # Assign characters to lines, keeping words together
                for token in bubble_tokens:
                    word_text = token['text']
                    word_len = len(word_text)
                    
                    # Calculate the center position of the entire word
                    word_char_sizes = all_char_sizes[char_idx : char_idx + word_len]
                    word_scaled_size = sum(word_char_sizes) * scale
                    word_center_pos = current_char_pos + word_scaled_size / 2
                    
                    # Determine which line the word belongs to based on its center
                    assigned_line = len(refined_lines) - 1
                    for idx, (start, end) in enumerate(line_intervals):
                        if start <= word_center_pos < end + 0.1:
                            assigned_line = idx
                            break
                            
                    # Kinsoku Shori: Punctuation should stick to the previous line
                    if char_idx > 0 and word_len > 0 and word_text[0] in '．。、！？…?!,.ー—~～':
                        assigned_line = prev_assigned_line
                        
                    # Assign all characters in the word to the chosen line
                    for char in word_text:
                        line_assignments[assigned_line].append(char)
                        
                    current_char_pos += word_scaled_size
                    prev_assigned_line = assigned_line
                    char_idx += word_len
                    
                bubble_lines_data = []
                char_index = 0
                
                for line_idx, bounds in enumerate(refined_lines):
                    lx, ly, lw, lh = bounds
                    line_text = "".join(line_assignments[line_idx])
                    if not line_text: continue
                    
                    line_char_sizes = all_char_sizes[char_index : char_index + len(line_text)]
                    line_total_size = sum(line_char_sizes)
                    current_pos_exact = float(ly if is_vertical else lx)
                    
                    char_boxes = []
                    
                    # Calculate total size of characters in this line
                    line_char_sizes = all_char_sizes[char_index : char_index + len(line_text)]
                    line_total_size = sum(line_char_sizes)
                    
                    # Calculate the available space to distribute
                    available_space = lh if is_vertical else lw
                    
                    # Calculate the scaling factor to fit characters into the available space
                    scale_factor = available_space / line_total_size if line_total_size > 0 else 1
                    
                    current_pos_exact = float(ly if is_vertical else lx)
                    
                    for j, char in enumerate(line_text):
                        # The exact size this character should take up in the line
                        char_exact_size = line_char_sizes[j] * scale_factor
                        
                        if is_vertical:
                            if j == len(line_text) - 1: 
                                char_exact_size = (ly + lh) - current_pos_exact
                            y_start = int(round(current_pos_exact))
                            y_end = int(round(current_pos_exact + char_exact_size))
                            char_boxes.append({'char': char, 'box': [lx, y_start, lw, y_end - y_start]})
                            current_pos_exact += char_exact_size
                        else:
                            if j == len(line_text) - 1: 
                                char_exact_size = (lx + lw) - current_pos_exact
                            x_start = int(round(current_pos_exact))
                            x_end = int(round(current_pos_exact + char_exact_size))
                            char_boxes.append({'char': char, 'box': [x_start, ly, x_end - x_start, lh]})
                            current_pos_exact += char_exact_size
                            
                    # Re-tokenize the line text to get the word data for the JSON
                    tokens = jp_tokenizer.tokenize(line_text)
                    words_data = []
                    char_offset = 0
                    
                    for token in tokens:
                        word_text = token['text']
                        word_len = len(word_text)
                        word_char_boxes = char_boxes[char_offset : char_offset + word_len]
                        
                        if word_char_boxes:
                            words_data.append({
                                "text": word_text,
                                "base_form": token['base_form'],
                                "reading": token['reading'],
                                "part_of_speech": token['part_of_speech'],
                                "characters": word_char_boxes
                            })
                        char_offset += word_len
                        
                    bubble_lines_data.append({"words": words_data})
                    char_index += len(line_text)
                    
                page_data['bubbles'].append({
                    "id": f"bubble_{b_idx}",
                    "direction": direction,
                    "box": [xmin, ymin, w, h],
                    "raw_text": bubble_text,
                    "lines": bubble_lines_data
                })
                
            manga_data['pages'].append(page_data)
            
            # Save intermediate JSON so viewer can read while processing
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(manga_data, f, ensure_ascii=False, indent=2)
            
        click.echo(f"[*] Packing data into {output}...")
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(json_path, "aburamushi.json")
            for img_path in images:
                zipf.write(img_path, img_path.name)
                
                small_filename = f"small_{img_path.name}"
                medium_filename = f"medium_{img_path.name}"
                zipf.write(Path(temp_dir) / small_filename, small_filename)
                zipf.write(Path(temp_dir) / medium_filename, medium_filename)
                
    click.echo("[*] Processing complete. Output saved.")

if __name__ == '__main__':
    process_manga()
