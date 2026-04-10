package formula

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// tokenType classifies lexer tokens.
type tokenType int

const (
	tokNumber tokenType = iota
	tokString
	tokIdent
	tokOperator
	tokComma
	tokLParen
	tokRParen
	tokEOF
)

type token struct {
	typ tokenType
	val string
}

// Supported aggregate/scalar functions (whitelist).
var allowedFunctions = map[string]bool{
	"SUM": true, "AVG": true, "MIN": true, "MAX": true, "COUNT": true,
	"ROUND": true, "CEIL": true, "FLOOR": true, "ABS": true,
	"COALESCE": true, "NULLIF": true,
	"IF": true,
}

// lex tokenizes a formula expression string.
func lex(input string) ([]token, error) {
	var tokens []token
	i := 0
	for i < len(input) {
		ch := rune(input[i])

		// Skip whitespace.
		if unicode.IsSpace(ch) {
			i++
			continue
		}

		// Numbers (including decimals).
		if unicode.IsDigit(ch) || (ch == '.' && i+1 < len(input) && unicode.IsDigit(rune(input[i+1]))) {
			start := i
			for i < len(input) && (unicode.IsDigit(rune(input[i])) || input[i] == '.') {
				i++
			}
			tokens = append(tokens, token{tokNumber, input[start:i]})
			continue
		}

		// Identifiers (field slugs, function names).
		if unicode.IsLetter(ch) || ch == '_' {
			start := i
			for i < len(input) && (unicode.IsLetter(rune(input[i])) || unicode.IsDigit(rune(input[i])) || input[i] == '_') {
				i++
			}
			tokens = append(tokens, token{tokIdent, input[start:i]})
			continue
		}

		// String literals (single-quoted).
		if ch == '\'' {
			i++
			start := i
			for i < len(input) && input[i] != '\'' {
				if input[i] == '\\' {
					i++ // skip escaped char
				}
				i++
			}
			if i >= len(input) {
				return nil, fmt.Errorf("unterminated string literal")
			}
			tokens = append(tokens, token{tokString, input[start:i]})
			i++ // skip closing quote
			continue
		}

		// Two-character operators.
		if i+1 < len(input) {
			two := input[i : i+2]
			if two == "<=" || two == ">=" || two == "!=" || two == "<>" {
				tokens = append(tokens, token{tokOperator, two})
				i += 2
				continue
			}
		}

		// Single-character operators and delimiters.
		switch ch {
		case '+', '-', '*', '/', '%', '<', '>', '=':
			tokens = append(tokens, token{tokOperator, string(ch)})
			i++
		case ',':
			tokens = append(tokens, token{tokComma, ","})
			i++
		case '(':
			tokens = append(tokens, token{tokLParen, "("})
			i++
		case ')':
			tokens = append(tokens, token{tokRParen, ")"})
			i++
		default:
			return nil, fmt.Errorf("unexpected character %q at position %d", ch, i)
		}
	}
	tokens = append(tokens, token{tokEOF, ""})
	return tokens, nil
}

// Parser converts a token stream into a safe PostgreSQL expression.
type Parser struct {
	tokens  []token
	pos     int
	slugs   map[string]bool // valid field slugs for this collection
	refSlugs []string       // referenced field slugs (output)
}

func (p *Parser) peek() token {
	if p.pos < len(p.tokens) {
		return p.tokens[p.pos]
	}
	return token{tokEOF, ""}
}

func (p *Parser) advance() token {
	t := p.peek()
	if p.pos < len(p.tokens) {
		p.pos++
	}
	return t
}

func (p *Parser) expect(typ tokenType) (token, error) {
	t := p.advance()
	if t.typ != typ {
		return t, fmt.Errorf("expected %d, got %q", typ, t.val)
	}
	return t, nil
}

// Parse parses the full expression and returns a safe SQL expression string
// along with the list of referenced field slugs.
func Parse(expression string, validSlugs map[string]bool) (sql string, refs []string, err error) {
	expression = strings.TrimSpace(expression)
	if expression == "" {
		return "", nil, fmt.Errorf("empty expression")
	}
	// Strip leading '=' if present (Excel convention).
	if expression[0] == '=' {
		expression = expression[1:]
	}

	tokens, err := lex(expression)
	if err != nil {
		return "", nil, err
	}

	p := &Parser{tokens: tokens, slugs: validSlugs}
	result, err := p.parseExpr()
	if err != nil {
		return "", nil, err
	}

	// Ensure we consumed all tokens.
	if p.peek().typ != tokEOF {
		return "", nil, fmt.Errorf("unexpected token %q after expression", p.peek().val)
	}

	return result, p.refSlugs, nil
}

// parseExpr handles the lowest-precedence operators: comparison.
func (p *Parser) parseExpr() (string, error) {
	left, err := p.parseAddSub()
	if err != nil {
		return "", err
	}

	for {
		t := p.peek()
		if t.typ == tokOperator && (t.val == "<" || t.val == ">" || t.val == "<=" || t.val == ">=" || t.val == "=" || t.val == "!=" || t.val == "<>") {
			p.advance()
			op := t.val
			if op == "=" {
				op = "=" // SQL uses single =
			}
			if op == "!=" {
				op = "<>"
			}
			right, err := p.parseAddSub()
			if err != nil {
				return "", err
			}
			left = fmt.Sprintf("(%s %s %s)", left, op, right)
		} else {
			break
		}
	}
	return left, nil
}

// parseAddSub handles + and -.
func (p *Parser) parseAddSub() (string, error) {
	left, err := p.parseMulDiv()
	if err != nil {
		return "", err
	}

	for {
		t := p.peek()
		if t.typ == tokOperator && (t.val == "+" || t.val == "-") {
			p.advance()
			right, err := p.parseMulDiv()
			if err != nil {
				return "", err
			}
			left = fmt.Sprintf("(%s %s %s)", left, t.val, right)
		} else {
			break
		}
	}
	return left, nil
}

// parseMulDiv handles *, /, %.
func (p *Parser) parseMulDiv() (string, error) {
	left, err := p.parseUnary()
	if err != nil {
		return "", err
	}

	for {
		t := p.peek()
		if t.typ == tokOperator && (t.val == "*" || t.val == "/" || t.val == "%") {
			p.advance()
			right, err := p.parseUnary()
			if err != nil {
				return "", err
			}
			left = fmt.Sprintf("(%s %s %s)", left, t.val, right)
		} else {
			break
		}
	}
	return left, nil
}

// parseUnary handles unary - and +.
func (p *Parser) parseUnary() (string, error) {
	t := p.peek()
	if t.typ == tokOperator && (t.val == "-" || t.val == "+") {
		p.advance()
		operand, err := p.parsePrimary()
		if err != nil {
			return "", err
		}
		if t.val == "-" {
			return fmt.Sprintf("(-%s)", operand), nil
		}
		return operand, nil
	}
	return p.parsePrimary()
}

// parsePrimary handles atoms: numbers, strings, identifiers, function calls, parenthesized exprs.
func (p *Parser) parsePrimary() (string, error) {
	t := p.peek()

	switch t.typ {
	case tokNumber:
		p.advance()
		// Validate it's a real number.
		if _, err := strconv.ParseFloat(t.val, 64); err != nil {
			return "", fmt.Errorf("invalid number %q", t.val)
		}
		return t.val, nil

	case tokString:
		p.advance()
		// Escape single quotes for SQL.
		escaped := strings.ReplaceAll(t.val, "'", "''")
		return fmt.Sprintf("'%s'", escaped), nil

	case tokIdent:
		p.advance()
		upper := strings.ToUpper(t.val)

		// IF function → CASE WHEN ... THEN ... ELSE ... END
		if upper == "IF" {
			return p.parseIF()
		}

		// Known function call.
		if allowedFunctions[upper] {
			return p.parseFunctionCall(upper)
		}

		// Must be a field slug reference.
		if !p.slugs[t.val] {
			return "", fmt.Errorf("unknown field or function %q", t.val)
		}
		p.refSlugs = append(p.refSlugs, t.val)
		return fmt.Sprintf("%q", t.val), nil

	case tokLParen:
		p.advance()
		expr, err := p.parseExpr()
		if err != nil {
			return "", err
		}
		if _, err := p.expect(tokRParen); err != nil {
			return "", fmt.Errorf("expected closing parenthesis")
		}
		return fmt.Sprintf("(%s)", expr), nil

	default:
		return "", fmt.Errorf("unexpected token %q", t.val)
	}
}

// parseFunctionCall parses FUNC(arg1, arg2, ...).
func (p *Parser) parseFunctionCall(name string) (string, error) {
	if _, err := p.expect(tokLParen); err != nil {
		return "", fmt.Errorf("expected '(' after function %s", name)
	}

	var args []string
	if p.peek().typ != tokRParen {
		for {
			arg, err := p.parseExpr()
			if err != nil {
				return "", err
			}
			args = append(args, arg)
			if p.peek().typ == tokComma {
				p.advance()
			} else {
				break
			}
		}
	}

	if _, err := p.expect(tokRParen); err != nil {
		return "", fmt.Errorf("expected ')' after function arguments")
	}

	return fmt.Sprintf("%s(%s)", name, strings.Join(args, ", ")), nil
}

// parseIF converts IF(cond, then, else) → CASE WHEN cond THEN then ELSE else END.
func (p *Parser) parseIF() (string, error) {
	if _, err := p.expect(tokLParen); err != nil {
		return "", fmt.Errorf("expected '(' after IF")
	}

	cond, err := p.parseExpr()
	if err != nil {
		return "", fmt.Errorf("IF condition: %w", err)
	}
	if p.peek().typ != tokComma {
		return "", fmt.Errorf("expected ',' after IF condition")
	}
	p.advance()

	thenExpr, err := p.parseExpr()
	if err != nil {
		return "", fmt.Errorf("IF then: %w", err)
	}
	if p.peek().typ != tokComma {
		return "", fmt.Errorf("expected ',' after IF then-expression")
	}
	p.advance()

	elseExpr, err := p.parseExpr()
	if err != nil {
		return "", fmt.Errorf("IF else: %w", err)
	}

	if _, err := p.expect(tokRParen); err != nil {
		return "", fmt.Errorf("expected ')' after IF else-expression")
	}

	return fmt.Sprintf("CASE WHEN %s THEN %s ELSE %s END", cond, thenExpr, elseExpr), nil
}
