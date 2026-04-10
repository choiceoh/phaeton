package handler

import (
	"context"
	"encoding/base64"
	"fmt"
	"html"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

// renderFormScreenshot generates a PNG screenshot of a form preview built from
// the AI-generated schema. The returned bytes are raw PNG data.
func renderFormScreenshot(ctx context.Context, result aiBuildResponse) ([]byte, error) {
	htmlContent := buildFormHTML(result)

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("disable-dev-shm-usage", true),
	)
	if p := os.Getenv("CHROME_PATH"); p != "" {
		opts = append(opts, chromedp.ExecPath(p))
	}

	allocCtx, allocCancel := chromedp.NewExecAllocator(ctx, opts...)
	defer allocCancel()

	taskCtx, taskCancel := chromedp.NewContext(allocCtx)
	defer taskCancel()

	taskCtx, timeoutCancel := context.WithTimeout(taskCtx, 15*time.Second)
	defer timeoutCancel()

	var buf []byte
	dataURL := "data:text/html;base64," + base64.StdEncoding.EncodeToString([]byte(htmlContent))

	err := chromedp.Run(taskCtx,
		chromedp.EmulateViewport(800, 1200),
		chromedp.Navigate(dataURL),
		chromedp.WaitReady("body"),
		chromedp.FullScreenshot(&buf, 90),
	)
	if err != nil {
		return nil, fmt.Errorf("chromedp screenshot: %w", err)
	}
	return buf, nil
}

// renderFormScreenshotBase64 returns the screenshot as a base64-encoded string.
func renderFormScreenshotBase64(ctx context.Context, result aiBuildResponse) (string, error) {
	buf, err := renderFormScreenshot(ctx, result)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf), nil
}

// buildFormHTML produces a self-contained HTML page that mimics the Phaeton
// form layout (6-column grid, field types, labels, widths).
func buildFormHTML(result aiBuildResponse) string {
	var sb strings.Builder

	sb.WriteString(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #fff; color: #111; padding: 24px; max-width: 800px;
  }
  .header { margin-bottom: 20px; }
  .header h1 { font-size: 18px; font-weight: 600; }
  .header p { font-size: 13px; color: #666; margin-top: 4px; }
  .grid {
    display: grid; grid-template-columns: repeat(6, 1fr);
    gap: 12px;
  }
  .field { padding: 10px; }
  .field-label {
    font-size: 12px; font-weight: 500; color: #333;
    margin-bottom: 4px; display: flex; align-items: center; gap: 2px;
  }
  .field-label .req { color: #e11d48; }
  .field-input {
    width: 100%; height: 36px; border: 1px solid #d4d4d8;
    border-radius: 6px; background: #fafafa; padding: 0 10px;
    font-size: 13px; color: #999; display: flex; align-items: center;
  }
  .field-textarea {
    width: 100%; border: 1px solid #d4d4d8;
    border-radius: 6px; background: #fafafa; padding: 8px 10px;
    font-size: 13px; color: #999; min-height: 72px;
  }
  .field-textarea.h2 { min-height: 96px; }
  .field-textarea.h3 { min-height: 144px; }
  .field-checkbox { display: flex; align-items: center; gap: 6px; height: 36px; }
  .field-checkbox .box {
    width: 16px; height: 16px; border: 1px solid #d4d4d8;
    border-radius: 4px; background: #fafafa;
  }
  .field-select {
    width: 100%; height: 36px; border: 1px solid #d4d4d8;
    border-radius: 6px; background: #fafafa; padding: 0 10px;
    font-size: 13px; color: #999; display: flex; align-items: center;
    justify-content: space-between;
  }
  .field-select .arrow { color: #999; font-size: 10px; }
  .layout-label {
    font-size: 14px; font-weight: 600; color: #111;
    padding: 8px 0 2px; border-bottom: none;
  }
  .layout-line { border-top: 1px solid #e4e4e7; margin: 4px 0; }
  .layout-spacer { height: 24px; }
  .col-1 { grid-column: span 1; }
  .col-2 { grid-column: span 2; }
  .col-3 { grid-column: span 3; }
  .col-6 { grid-column: span 6; }
  .footer {
    margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;
  }
  .btn {
    padding: 8px 16px; border-radius: 6px; font-size: 13px;
    font-weight: 500; cursor: pointer; border: 1px solid #d4d4d8;
  }
  .btn-primary { background: #111; color: #fff; border-color: #111; }
  .btn-outline { background: #fff; color: #333; }
  .type-badge {
    font-size: 10px; color: #888; background: #f4f4f5;
    border-radius: 4px; padding: 1px 5px; margin-left: 6px;
  }
</style>
</head>
<body>
`)

	// Header
	sb.WriteString(`<div class="header">`)
	sb.WriteString(fmt.Sprintf(`<h1>%s</h1>`, html.EscapeString(result.Label)))
	if result.Description != "" {
		sb.WriteString(fmt.Sprintf(`<p>%s</p>`, html.EscapeString(result.Description)))
	}
	sb.WriteString(`</div>`)

	// Grid
	sb.WriteString(`<div class="grid">`)
	for _, f := range result.Fields {
		width := f.Width
		if width == 0 {
			width = 6
		}
		colClass := fmt.Sprintf("col-%d", width)

		switch f.FieldType {
		case "label":
			text := f.Label
			if opts, ok := f.Options["text"]; ok {
				if s, ok := opts.(string); ok {
					text = s
				}
			}
			sb.WriteString(fmt.Sprintf(`<div class="col-6"><div class="layout-label">%s</div></div>`, html.EscapeString(text)))
		case "line":
			sb.WriteString(`<div class="col-6"><div class="layout-line"></div></div>`)
		case "spacer":
			sb.WriteString(`<div class="col-6"><div class="layout-spacer"></div></div>`)
		default:
			sb.WriteString(fmt.Sprintf(`<div class="field %s">`, colClass))

			// Label
			sb.WriteString(`<div class="field-label">`)
			sb.WriteString(html.EscapeString(f.Label))
			if f.IsRequired {
				sb.WriteString(`<span class="req">*</span>`)
			}
			sb.WriteString(fmt.Sprintf(`<span class="type-badge">%s</span>`, html.EscapeString(fieldTypeLabel(f.FieldType))))
			sb.WriteString(`</div>`)

			// Input
			renderFieldInput(&sb, f)

			sb.WriteString(`</div>`)
		}
	}
	sb.WriteString(`</div>`)

	// Footer
	sb.WriteString(`<div class="footer">`)
	sb.WriteString(`<button class="btn btn-outline">취소</button>`)
	sb.WriteString(`<button class="btn btn-primary">저장</button>`)
	sb.WriteString(`</div>`)

	sb.WriteString(`</body></html>`)
	return sb.String()
}

func renderFieldInput(sb *strings.Builder, f aiBuildField) {
	switch f.FieldType {
	case "textarea":
		hClass := ""
		if f.Height >= 3 {
			hClass = " h3"
		} else if f.Height >= 2 {
			hClass = " h2"
		}
		sb.WriteString(fmt.Sprintf(`<div class="field-textarea%s">내용을 입력하세요</div>`, hClass))

	case "boolean":
		sb.WriteString(`<div class="field-checkbox"><div class="box"></div><span style="font-size:13px;color:#999">선택</span></div>`)

	case "select":
		placeholder := "선택하세요"
		if choices, ok := f.Options["choices"]; ok {
			if arr, ok := choices.([]interface{}); ok && len(arr) > 0 {
				if s, ok := arr[0].(string); ok {
					placeholder = s
				}
			}
		}
		sb.WriteString(fmt.Sprintf(`<div class="field-select"><span>%s</span><span class="arrow">▼</span></div>`, html.EscapeString(placeholder)))

	case "multiselect":
		sb.WriteString(`<div class="field-select"><span>항목을 선택하세요</span><span class="arrow">▼</span></div>`)

	case "date":
		sb.WriteString(`<div class="field-input">YYYY-MM-DD</div>`)
	case "datetime":
		sb.WriteString(`<div class="field-input">YYYY-MM-DD HH:MM</div>`)
	case "time":
		sb.WriteString(`<div class="field-input">HH:MM</div>`)
	case "file":
		sb.WriteString(`<div class="field-input">파일을 선택하세요</div>`)
	case "user":
		sb.WriteString(`<div class="field-select"><span>사용자 선택</span><span class="arrow">▼</span></div>`)
	case "relation":
		sb.WriteString(`<div class="field-select"><span>항목 선택</span><span class="arrow">▼</span></div>`)
	case "autonumber":
		sb.WriteString(`<div class="field-input" style="background:#f0f0f0;color:#aaa">(자동 생성)</div>`)
	case "number", "integer":
		placeholder := "0"
		if dt, ok := f.Options["display_type"]; ok {
			if s, ok := dt.(string); ok && s == "currency" {
				placeholder = "₩ 0"
			}
		}
		sb.WriteString(fmt.Sprintf(`<div class="field-input">%s</div>`, placeholder))
	default:
		// text, json, etc.
		placeholder := "텍스트를 입력하세요"
		if dt, ok := f.Options["display_type"]; ok {
			switch dt {
			case "email":
				placeholder = "example@email.com"
			case "url":
				placeholder = "https://"
			case "phone":
				placeholder = "010-0000-0000"
			}
		}
		sb.WriteString(fmt.Sprintf(`<div class="field-input">%s</div>`, html.EscapeString(placeholder)))
	}
}

func fieldTypeLabel(ft string) string {
	switch ft {
	case "text":
		return "텍스트"
	case "textarea":
		return "장문"
	case "number":
		return "숫자"
	case "integer":
		return "정수"
	case "boolean":
		return "체크박스"
	case "date":
		return "날짜"
	case "datetime":
		return "날짜시간"
	case "time":
		return "시간"
	case "select":
		return "선택"
	case "multiselect":
		return "다중선택"
	case "user":
		return "사용자"
	case "file":
		return "파일"
	case "relation":
		return "관계"
	case "autonumber":
		return "자동번호"
	case "json":
		return "JSON"
	default:
		return ft
	}
}
