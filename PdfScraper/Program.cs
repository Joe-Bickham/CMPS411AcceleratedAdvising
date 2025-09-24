using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

class Program
{
    static void Main()
    {
        string pdfPath = @"C:\Users\ggriz\OneDrive\Desktop\School Stuff\Fall 25\CMPS 4110\Communication, BA, Sports Communication Concentration - Southeastern Louisiana University - Modern Campus Catalog™.pdf";
        string outputPath = "sample.txt";

        using var doc = PdfDocument.Open(pdfPath);

        // Build ordered tokens & lines once (robust to line breaks/punctuation)
        var tokens = new List<Token>();
        var lines  = new List<LineRef>();
        BuildGlobalTokensAndLines(doc, tokens, lines);

        var outLines = new List<string>();

        // ===== Phase 1: capture ALL blocks between markers across the doc =====
        int searchFrom = 0;
        int lastEndLineIdx = -1;

        while (true)
        {
            int startTok = FindSequence(tokens, new[] { "course", "name" }, searchFrom);
            if (startTok < 0) break;

            int endTok = FindSequence(tokens, new[] { "total", "credit", "hours" }, startTok + 2);
            if (endTok < 0) break;

            int startLineIdx = tokens[startTok].LineGlobalIndex;   // line with "Course"
            int endLineIdx   = tokens[endTok].LineGlobalIndex;     // line with "Total"

            int firstContentLine = startLineIdx + 1;
            int lastContentLine  = endLineIdx - 1;

            if (firstContentLine <= lastContentLine &&
                firstContentLine >= 0 && lastContentLine < lines.Count)
            {
                for (int i = firstContentLine; i <= lastContentLine; i++)
                    outLines.Add(lines[i].Text);
            }

            // Move search past this end marker to find the next block
            searchFrom = endTok + 1;
            lastEndLineIdx = endLineIdx;
        }

        // ===== Phase 2: electives toggle starting after the LAST Phase 1 block =====
        if (lastEndLineIdx < 0) lastEndLineIdx = -1; // if Phase 1 found nothing, start at 0

        for (int i = Math.Max(0, lastEndLineIdx + 1); i < lines.Count; i++)
        {
            var line = lines[i].Text;
            if (EndsWithWord(line, "electives"))
            {
                // include boundary then capture until next boundary (inclusive toggle)
                outLines.Add(line);
                i++;
                for (; i < lines.Count; i++)
                {
                    var l2 = lines[i].Text;
                    if (EndsWithWord(l2, "electives"))
                    {
                        outLines.Add(l2); // include closing boundary
                        break;            // stop this capture block; continue scanning
                    }
                    outLines.Add(l2);
                }
            }
        }

        File.WriteAllLines(outputPath, outLines);
        Console.WriteLine($"Wrote {outLines.Count} lines to {outputPath}");
    }

    // ================== Core extraction ==================

    private static void BuildGlobalTokensAndLines(PdfDocument doc, List<Token> allTokens, List<LineRef> allLines)
    {
        for (int p = 0; p < doc.NumberOfPages; p++)
        {
            var page = doc.GetPage(p + 1);

            var words = page.GetWords()
                .Select(w => new WordGeom
                {
                    Text = CleanToken(w.Text),
                    X    = w.BoundingBox.Left,
                    Y    = (w.BoundingBox.Top + w.BoundingBox.Bottom) / 2.0,
                    H    = w.BoundingBox.Height
                })
                .Where(w => !string.IsNullOrWhiteSpace(w.Text))
                .OrderByDescending(w => w.Y) // top -> bottom
                .ThenBy(w => w.X)           // left -> right
                .ToList();

            var clusters = ClusterLines(words, 0.6, 3.0);

            var localToGlobal = new List<int>(clusters.Count);
            foreach (var ln in clusters)
            {
                var text = string.Join(" ", ln.Words.OrderBy(x => x.X).Select(x => x.Text));
                text = CollapseSpaces(text).Trim();
                if (string.IsNullOrWhiteSpace(text)) continue;

                int gIdx = allLines.Count;
                allLines.Add(new LineRef { Page = p + 1, Text = text });
                localToGlobal.Add(gIdx);
            }

            int currentLocal = -1;
            foreach (var ln in clusters)
            {
                currentLocal++;
                if (currentLocal >= localToGlobal.Count) break;
                int gLineIdx = localToGlobal[currentLocal];

                foreach (var w in ln.Words.OrderBy(x => x.X))
                {
                    foreach (var part in SplitIntoTokens(w.Text))
                    {
                        allTokens.Add(new Token
                        {
                            Text            = part,
                            Page            = p + 1,
                            LineGlobalIndex = gLineIdx,
                            OrderIndex      = allTokens.Count
                        });
                    }
                }
            }
        }
    }

    // ================== Utilities ==================

    private static int FindSequence(List<Token> tokens, string[] seq, int startAt = 0)
    {
        var needle = seq.Select(Norm).ToArray();
        for (int i = Math.Max(0, startAt); i <= tokens.Count - needle.Length; i++)
        {
            bool match = true;
            for (int k = 0; k < needle.Length; k++)
            {
                if (Norm(tokens[i + k].Text) != needle[k]) { match = false; break; }
            }
            if (match) return i;
        }
        return -1;
    }

    private static List<LineCluster> ClusterLines(List<WordGeom> words, double minTol, double maxTol)
    {
        var lines = new List<LineCluster>();
        LineCluster? current = null;

        foreach (var w in words)
        {
            if (current == null)
            {
                current = new LineCluster();
                current.Add(w);
                lines.Add(current);
                continue;
            }

            double dy = Math.Abs(w.Y - current.MedianY);
            double dynTol = 0.4 * (current.MedianH + w.H);
            dynTol = Math.Clamp(dynTol, minTol, maxTol);

            if (dy > dynTol)
            {
                current = new LineCluster();
                current.Add(w);
                lines.Add(current);
            }
            else
            {
                current.Add(w);
            }
        }
        return lines;
    }

    private static string CollapseSpaces(string s)
        => string.Join(" ", (s ?? string.Empty).Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries));

    private static IEnumerable<string> SplitIntoTokens(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) yield break;
        var t = Regex.Replace(text, @"[^\p{L}\p{N}]+", " "); // keep letters/numbers
        foreach (var part in t.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
            yield return part;
    }

    private static string CleanToken(string s)
    {
        if (string.IsNullOrWhiteSpace(s)) return string.Empty;
        var t = s.Replace('\u00A0', ' ');
        t = Regex.Replace(t, @"\s+", " ").Trim();
        return t;
    }

    private static string Norm(string s) => (s ?? string.Empty).ToLowerInvariant();

    private static bool EndsWithWord(string line, string word)
    {
        if (string.IsNullOrWhiteSpace(line)) return false;
        var trimmed = line.TrimEnd()
                          .TrimEnd('.', ',', ';', ':', '!', '?', ')', ']', '}', '"', '\'')
                          .TrimEnd();
        return trimmed.EndsWith(word, true, CultureInfo.InvariantCulture);
    }

    // ================== Models ==================

    private sealed class WordGeom
    {
        public string Text = "";
        public double X, Y, H;
    }

    private sealed class LineCluster
    {
        public readonly List<WordGeom> Words = new();
        public double MedianY => Median(_ys);
        public double MedianH => Median(_hs);

        private readonly List<double> _ys = new();
        private readonly List<double> _hs = new();

        public void Add(WordGeom w)
        {
            Words.Add(w);
            _ys.Add(w.Y);
            _hs.Add(w.H);
        }

        private static double Median(List<double> vals)
        {
            if (vals.Count == 0) return 0;
            var a = vals.OrderBy(v => v).ToList();
            int n = a.Count;
            return (n % 2 == 1) ? a[n / 2] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
        }
    }

    private sealed class Token
    {
        public string Text = "";
        public int Page;
        public int LineGlobalIndex;
        public int OrderIndex;
    }

    private sealed class LineRef
    {
        public int Page;
        public string Text = "";
    }
}
