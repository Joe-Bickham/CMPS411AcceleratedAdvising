using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

class Program
{
    static void Main(string[] args)
    {
        string pdfPath = @"C:\Users\ggriz\OneDrive\Desktop\School Stuff\Fall 25\CMPS 4110\Communication, BA, Sports Communication Concentration - Southeastern Louisiana University - Modern Campus Catalog™.pdf";
        string outputPath = "sample.txt";

        List<string> results = new List<string>();
        bool capture = false;

        using (PdfDocument document = PdfDocument.Open(pdfPath))
        {
            foreach (Page page in document.GetPages())
            {
                var words = page.GetWords().Select(w => w.Text).ToList();

                for (int i = 0; i < words.Count; i++)
                {
                    // Detect start phrase "Course Name"
                    if (i + 1 < words.Count && words[i].Equals("Course", StringComparison.OrdinalIgnoreCase) &&
                                             words[i + 1].Equals("Name", StringComparison.OrdinalIgnoreCase))
                    {
                        capture = true;
                        i++; // skip "Name"
                        continue;
                    }

                    // Detect end phrase "Total Credit Hours"
                    if (i + 2 < words.Count && words[i].Equals("Total", StringComparison.OrdinalIgnoreCase) &&
                                              words[i + 1].Equals("Credit", StringComparison.OrdinalIgnoreCase) &&
                                              words[i + 2].Equals("Hours", StringComparison.OrdinalIgnoreCase))
                    {
                        capture = false;
                        i += 2; // skip "Credit Hours"
                        continue;
                    }

                    // Capture words while inside section
                    if (capture)
                    {
                        results.Add(words[i]);
                    }
                }
            }
        }

        // Write results into a text file
        File.WriteAllText(outputPath, string.Join(" ", results));

        Console.WriteLine($"Extraction complete. Results saved to {outputPath}");
    }
}
