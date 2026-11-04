// Protect Markdown code and existing dollar-delimited math while converting LaTeX delimiters.
export function normalizeMath(content: string): string {
  const protectedOrMath = /^( {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[ \t]*$|(?![\s\S]))|^(?: {4}|\t)[^\n]*|(`+)(?!`)[\s\S]*?\3(?!`)|\$\$[\s\S]*?\$\$|\$(?!\$)[^\n$]*?\$|(\\{1,2})\(([^\n]*?)\4\)|(\\{1,2})\[([\s\S]*?)\6\]/gm;
  return content.replace(protectedOrMath, (match, _indent, _fence, _ticks, inline, inlineBody, display, displayBody) => {
    if (inline) return `$${inlineBody.replace(/\\_/g, "_")}$`;
    if (display) return `\n\n$$\n${displayBody.replace(/\\_/g, "_")}\n$$\n\n`;
    return match;
  });
}
