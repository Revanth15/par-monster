'use client';

import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command"
import { Badge } from "@/components/ui/badge";
import clsx from 'clsx';

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1T8KrDYRM1nGBovTHpK-kNFLkZFkMsBhhedpRRlg35-w/export?format=csv&gid=1921491470";

const TARGET_COLUMNS = ["Date", "Conduct_Name", "Pointers", "Submitted_By"];
// Helper: Normalize conduct names like "STRENGTH & POWER 1" → "STRENGTH & POWER"
function normalizeConduct(name: string) {
  return name.replace(/\s\d+$/, "").trim().toUpperCase();
}

// Helper: Parse the pointers text into structured entries
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

interface FeedbackRow {
  category: string;
  issue: string;
  recommendation: string;
  severity: "High" | "Medium" | "Low" | string;
  frequency: number;
}


export default function SheetProcessor() {
  const [sheetData, setSheetData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // const [selectedDate, setSelectedDate] = useState("");
  const [selectedConduct, setSelectedConduct] = useState("");
  const [aiResponse, setAiResponse] = useState<FeedbackRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [openDatePopup, setOpenDatePopup] = useState(false);
  const [openConductPopup, setOpenConductPopup] = useState(false);

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

  useEffect(() => {
    fetchAndParse();
  }, []);

  // Filter data based on current selection
  useEffect(() => {
    const filtered = sheetData.filter((row) => {
      // const matchesDate = !selectedDate || row.Date === selectedDate;
      const matchesConduct =
        !selectedConduct ||
        normalizeConduct(row.Conduct_Name) === selectedConduct;
      return matchesConduct;
    });

    setFilteredData(filtered);
  }, [sheetData, selectedConduct]);

  // Extract unique values for filtering
  const uniqueDates = [...new Set(sheetData.map((r) => r.Date))];
  const uniqueConducts = [
    ...new Set(sheetData.map((r) => normalizeConduct(r.Conduct_Name))),
  ];

  const handleGenerateFeedback = async () => {
    setSubmitting(true);
    setAiResponse([]);
  
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
      let parsed: FeedbackRow[] = [];

      if (typeof result === "string") {
        const cleaned = result.trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```$/, "");
        parsed = JSON.parse(cleaned) as FeedbackRow[];
      } else if (Array.isArray(result)) {
        parsed = result as FeedbackRow[];
      }

      setAiResponse(parsed);
      console.log('🧠 AI Feedback:', result);
    } catch (error) {
      console.error('Error generating feedback:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = useMemo(() => {
    const map: Record<string, FeedbackRow[]> = {};
    aiResponse.forEach((row) => {
      (map[row.category] ??= []).push(row);
    });
    return map;
  }, [aiResponse]);

  return (
    <div className="space-y-6">
      {/* Table Display */}
        <Card>
          <CardContent className="p-6 pt-0 space-y-4">
            <h1 className="text-xl font-bold">1 SIR PAR ANALYSER</h1>
            <div className="flex flex-wrap gap-4">
              {/* <div>
                <label className="block font-medium mb-1">Date</label>
                <Popover open={openDatePopup} onOpenChange={setOpenDatePopup}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openDatePopup}
                      className="w-[100px] justify-between"
                    >
                      {selectedDate
                        ? uniqueDates.find((date) => date === selectedDate)
                        : "Select date..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search rank..." />
                      <CommandList>
                        <CommandEmpty>No date found.</CommandEmpty>
                        <CommandGroup>
                          {uniqueDates.map((date) => (
                            <CommandItem
                              key={date}
                              value={date}
                              onSelect={(value) => {
                                setSelectedDate(value === selectedDate ? "" : value);
                                setOpenDatePopup(false);
                              }}
                            >
                              {date}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div> */}

              <div>
                {/* <label className="block font-medium mb-1">Conduct</label> */}
                <Popover open={openConductPopup} onOpenChange={setOpenConductPopup}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openConductPopup}
                      className="w-[200px] justify-between truncate"
                    >
                      {selectedConduct
                        ? uniqueConducts.find((date) => date === selectedConduct)
                        : "Select conduct..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0">
                    <Command>
                      <CommandInput placeholder="Search conduct..." />
                      <CommandList>
                        <CommandEmpty>No conduct found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="All Conducts"
                            onSelect={(value) => {
                              setSelectedConduct(value === selectedConduct ? "" : value);
                              setOpenConductPopup(false);
                            }}
                          ></CommandItem>
                          {uniqueConducts.map((conduct) => (
                            <CommandItem
                              key={conduct}
                              value={conduct}
                              onSelect={(value) => {
                                setSelectedConduct(value === selectedConduct ? "" : value);
                                setOpenConductPopup(false);
                              }}
                            >
                              {conduct}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <Button
                    className={`ml-2 cursor-pointer ${submitting || filteredData.length === 0 || !selectedConduct ? 'cursor-not-allowed' : 'pointer'}`}
                    onClick={handleGenerateFeedback}
                    disabled={submitting || filteredData.length === 0 || !selectedConduct}
                  >
                    {submitting ? 'Generating...' : 'Generate AI Analysis'}
                </Button>

              </div>
              {(selectedConduct) && (
                  <Button
                    variant="ghost"
                    className="text-red-500 ml-auto flex items-center gap-2"
                    onClick={() => {
                      setSelectedConduct('');
                    }}
                  >
                    <Trash2 size={16} />
                    Clear Filters
                  </Button>
                )}
            </div>
            
            {filteredData.length > 0 && (
            <ScrollArea className="max-h-[600px] overflow-auto border rounded-md">
              <div className="min-w-[900px]">
              {Array.isArray(aiResponse) && aiResponse.length > 0 && (
                <Card className='m-2'>
                  <CardContent className="px-4 space-y-4">
                    <h2 className="font-medium text-lg">📝 Analysis</h2>

                    <Table>
                      <TableHeader>
                        <TableRow className='bg-stone-800'>
                          <TableHead className="w-40">Category</TableHead>
                          <TableHead>Issue</TableHead>
                          <TableHead>Recommendation</TableHead>
                          <TableHead className="text-center w-28">Severity</TableHead>
                          <TableHead className="text-center w-28">Frequency</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {Object.entries(grouped).map(([category, items]) =>
                          items.map((item, idx) => (
                            <TableRow key={`${category}-${idx}`}>
                              {idx === 0 && (
                                <TableCell rowSpan={items.length}>{category}</TableCell>
                              )}

                              <TableCell>{item.issue}</TableCell>

                              <TableCell>{item.recommendation}</TableCell>

                              <TableCell className="text-center">
                                <Badge
                                  variant="secondary"
                                  className={clsx(
                                    "px-2",
                                    item.severity === "High" && "bg-red-600 text-white",
                                    item.severity === "Medium" && "bg-orange-500 text-white",
                                    item.severity === "Low" && "bg-green-500 text-white"
                                  )}
                                >
                                  {item.severity}
                                </Badge>
                              </TableCell>

                              <TableCell className="text-center">
                                <Badge variant="secondary" className="bg-gray-500 px-2">
                                  {item.frequency}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>

                    </Table>
                  </CardContent>
                </Card>
              )}

                <Table>
                  <TableHeader>
                    <TableRow className='bg-stone-800'>
                      <TableHead className='text-lg font-semibold'>Date</TableHead>
                      <TableHead className='text-lg font-semibold'>Conduct</TableHead>
                      <TableHead className='text-lg font-semibold'>Pointers</TableHead>
                      <TableHead className='text-lg font-semibold'>Submitted By</TableHead>
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
                        <TableCell>
                          {row.Submitted_By.replace(/_/g, ' ').toUpperCase()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
            )}
          </CardContent>
        </Card>
    </div>
  );
}