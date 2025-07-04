'use client';

import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Select } from "@/components/ui/select"; 

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1T8KrDYRM1nGBovTHpK-kNFLkZFkMsBhhedpRRlg35-w/export?format=csv&gid=1921491470";

const TARGET_COLUMNS = ["Date", "Conduct_Name", "Pointers", "Submitted_By"];
// 🧩 Helper: Normalize conduct names like "STRENGTH & POWER 1" → "STRENGTH & POWER"
function normalizeConduct(name: string) {
  return name.replace(/\s\d+$/, "").trim();
}

// 🧩 Helper: Parse the pointers text into structured entries
function parsePointers(pointersText: string) {
  if (!pointersText) return [];

  const lines = pointersText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result: {
    observation: string;
    reflection: string;
    recommendation: string;
  }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("Observation")) {
      const observation = lines[i + 1] ?? "";
      const reflectionLine = lines[i + 2] ?? "";
      const reflection = lines[i + 3] ?? "";
      const recommendationLine = lines[i + 4] ?? "";
      const recommendation = lines[i + 5] ?? "";

      if (
        reflectionLine.startsWith("Reflection") &&
        recommendationLine.startsWith("Recommendation")
      ) {
        result.push({
          observation,
          reflection,
          recommendation,
        });
        i += 5; 
      }
    }
  }

  return result;
}


export default function SheetProcessor() {
  const [sheetData, setSheetData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedConduct, setSelectedConduct] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAndParse = async () => {
    setLoading(true);
    try {
      const response = await fetch(SHEET_URL);
      const csvText = await response.text();

      const { data } = Papa.parse<any>(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      const filtered = data.map((row) => {
        const filteredRow: Record<string, any> = {};
        TARGET_COLUMNS.forEach((key) => {
          filteredRow[key] = row[key] ?? "";
        });
        return filteredRow;
      });

      setSheetData(filtered);
    } catch (error) {
      console.error("Error fetching or parsing sheet:", error);
    } finally {
      setLoading(false);
    }
  };

  // 💡 Filter data based on current selection
  useEffect(() => {
    const filtered = sheetData.filter((row) => {
      const matchesDate = !selectedDate || row.Date === selectedDate;
      const matchesConduct =
        !selectedConduct ||
        normalizeConduct(row.Conduct_Name) === selectedConduct;
      return matchesDate && matchesConduct;
    });

    setFilteredData(filtered);
  }, [sheetData, selectedDate, selectedConduct]);

  // Extract unique values for filters
  const uniqueDates = [...new Set(sheetData.map((r) => r.Date))];
  const uniqueConducts = [
    ...new Set(sheetData.map((r) => normalizeConduct(r.Conduct_Name))),
  ];

  const handleGenerateFeedback = async () => {
    setSubmitting(true);
    setAiResponse(null);
  
    try {
      const formattedConducts = filteredData
        .map((row) => {
          const parsed = parsePointers(row.Pointers);
          if (parsed.length === 0) return null;
  
          const pointerText = parsed
            .map(
              (p, i) => `Observation ${i + 1}: ${p.observation}
  Reflection ${i + 1}: ${p.reflection}
  Recommendation ${i + 1}: ${p.recommendation}`
            )
            .join('\n\n');
  
          return `Conduct Name: ${row.Conduct_Name}\n${pointerText}`;
        })
        .filter(Boolean)
        .join('\n\n---\n\n');
  
      const userMessage = `Here are the PAR Pointers for several conducts:\n\n${formattedConducts}`;
  
      const res = await fetch('/api/generateFeedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userMessage }),
      });
      const { result } = await res.json();
      setAiResponse(result);      
      console.log('🧠 AI Feedback:', result);
    } catch (error) {
      console.error('Error generating feedback:', error);
      setAiResponse('⚠️ Failed to fetch feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <h1 className="text-xl font-semibold">📥 Fetch & Display Google Sheet</h1>
          <Button onClick={fetchAndParse} disabled={loading}>
            {loading ? "Loading..." : "Fetch Sheet Data"}
          </Button>
        </CardContent>
      </Card>

      {/* Table Display */}
      {filteredData.length > 0 && (
        <Card>
          <CardContent className="p-6 pt-0 space-y-4">
            <h2 className="text-lg font-medium">📊 Conducts</h2>
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block font-medium mb-1">Date</label>
                <select
                  className="border p-2 rounded"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                >
                  <option value="">All Dates</option>
                  {uniqueDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium mb-1">Conduct</label>
                <select
                  className="border p-2 rounded"
                  value={selectedConduct}
                  onChange={(e) => setSelectedConduct(e.target.value)}
                >
                  <option value="">All Conducts</option>
                  {uniqueConducts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <Button onClick={handleGenerateFeedback} disabled={submitting || filteredData.length === 0}>
                  {submitting ? 'Generating...' : '🧠 Generate AI Feedback'}
                </Button>
              </div>
            </div>
            <ScrollArea className="max-h-[500px] overflow-auto border rounded-md">
              <div className="min-w-[900px]">
              {aiResponse && (
                  <Card>
                    <CardContent className="p-4 space-y-2">
                      <h3 className="font-medium text-lg">📝 AI Feedback</h3>
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {aiResponse}
                        </ReactMarkdown>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Conduct</TableHead>
                      <TableHead>Pointers</TableHead>
                      <TableHead>Submitted By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.Date}</TableCell>
                        <TableCell>{row.Conduct_Name}</TableCell>
                        <TableCell className="space-y-2">
                          {parsePointers(row.Pointers).length > 0 ? (
                            parsePointers(row.Pointers).map((entry, idx) => (
                              <Card
                                key={idx}
                                className="p-3 space-y-2 sm:max-w-md md:max-w-lg lg:max-w-xl"
                              >
                                <CardContent className="space-y-1 text-sm text-wrap">
                                  <div>
                                    <strong>Observation:</strong> {entry.observation}
                                  </div>
                                  <div>
                                    <strong>Reflection:</strong> {entry.reflection}
                                  </div>
                                  <div>
                                    <strong>Recommendation:</strong> {entry.recommendation}
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          ) : (
                            <span className="text-muted-foreground italic">No PAR Pointers</span>
                          )}
                        </TableCell>
                        <TableCell>{row.Submitted_By}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}