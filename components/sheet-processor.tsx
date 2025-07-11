'use client';

import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, XIcon } from 'lucide-react';
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
import { MultiSelect } from "@/components/multiselect";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1T8KrDYRM1nGBovTHpK-kNFLkZFkMsBhhedpRRlg35-w/export?format=csv&gid=1921491470";

const TARGET_COLUMNS = ["Date", "Conduct_Name", "Pointers", "Submitted_By"];
const ONESIR_COMPANIES_OPTIONS = [
  { value: "ALPHA", label: "ALPHA", },
  { value: "BRAVO", label: "BRAVO", },
  { value: "CHARLIE", label: "CHARLIE", },
  { value: "SUPPORT", label: "SUPPORT", },
  { value: "MSC", label: "MSC", },
];

type TargetCol = (typeof TARGET_COLUMNS)[number];
interface SheetRow extends Record<TargetCol | "Company", string> {}
const ONESIR_COMPANIES_SHEETS: Record<string, string> = {
  ALPHA : "https://docs.google.com/spreadsheets/d/1MfKz366shlm9TgaNz3H-LLSVp9GJxuYJsSFhDx5mpic/export?format=csv&gid=1921491470",
  BRAVO : "https://docs.google.com/spreadsheets/d/1Ltj1zXeIpheSbJwYzqiuvyHiJHp3ksDP6X0sLR1ikl4/export?format=csv&gid=1921491470",
  CHARLIE : "https://docs.google.com/spreadsheets/d/1tBvAlu1Fkyf5j8HZgvFbqSJ4CnAeeHspdRNNvqqGUJQ/export?format=csv&gid=1921491470",
  SUPPORT : "https://docs.google.com/spreadsheets/d/1T8KrDYRM1nGBovTHpK-kNFLkZFkMsBhhedpRRlg35-w/export?format=csv&gid=1921491470",
  MSC : "https://docs.google.com/spreadsheets/d/1UwoKYS6UxFHpRaCNJJkN6x7x8soTnbR7iDfImad8NmY/export?format=csv&gid=1921491470",
}

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
  const [selectedConduct, setSelectedConduct] = useState("");
  const [aiResponse, setAiResponse] = useState<FeedbackRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [openConductPopup, setOpenConductPopup] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

  const fetchAllSheets = async () => {
    setLoading(true);
  
    try {
      const entries = Object.entries(ONESIR_COMPANIES_SHEETS); 
  
      const allCompanyRows: SheetRow[][] = await Promise.all(
        entries.map(async ([company, url]) => {
          const csv = await fetch(url).then(r => r.text());
  
          const { data } = Papa.parse<Record<string, string>>(csv, {
            header: true,
            skipEmptyLines: true,
          });
  
          return data.map(row => {
            const filtered: SheetRow = {
              Company: company,
            } as SheetRow;
  
            TARGET_COLUMNS.forEach(col => {
              filtered[col] = row[col] ?? "";
            });
  
            return filtered;
          });
        })
      );
  
      const mergedRows: SheetRow[] = allCompanyRows.flat();
  
      mergedRows.sort(
        (a, b) => Number(new Date(b.Date)) - Number(new Date(a.Date))
      );
  
      setSheetData(mergedRows);
    } catch (err) {
      console.error("Error fetching or parsing sheets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSheets();
  }, []);

  // Filter data based on current selection
  useEffect(() => {
    const filtered = sheetData.filter(row => {
      // — Conduct filter —
      const matchesConduct =
        !selectedConduct || normalizeConduct(row.Conduct_Name) === selectedConduct;
  
      // — Company filter —
      const matchesCompany =
        selectedCompanies.length === 0 ||          // none selected → keep all
        selectedCompanies.includes(row.Company);   // otherwise match
  
      return matchesConduct && matchesCompany;
    });
  
    setFilteredData(filtered);
  }, [sheetData, selectedConduct, selectedCompanies]);

  // Extract unique values for filtering
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
              <div className='flex'>
                <MultiSelect
                  options={ONESIR_COMPANIES_OPTIONS}
                  onValueChange={setSelectedCompanies}
                  className='mx-2 w-[75%] h-full'
                  defaultValue={selectedCompanies}
                  placeholder="Select Companies"
                  variant="inverted"
                  animation={2}
                  maxCount={99}
                />

                <Popover open={openConductPopup} onOpenChange={setOpenConductPopup}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openConductPopup}
                      className="w-[200px] h-full justify-between truncate"
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
                    className={`ml-2 cursor-pointer ${submitting || filteredData.length === 0 || !selectedConduct ? 'cursor-not-allowed' : 'pointer'}, h-full`}
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

            <div>
              {Array.isArray(aiResponse) && aiResponse.length > 0 && (
                <Card className='m-2'>
                  <CardContent className="px-4 space-y-4">
                  <div className="flex justify-between items-center w-full">
                    <h2 className="font-medium text-lg">📝 Analysis</h2>
                    <XIcon
                      className="h-4 mx-2 cursor-pointer text-muted-foreground"
                      onClick={(event) => {
                        setAiResponse([]);
                      }}
                    />
                  </div>

                    <Table className='table-fixed w-full'>
                      <TableHeader>
                        <TableRow className='bg-stone-800'>
                          <TableHead className="w-[10%] max-w-[10%]">Category</TableHead>
                          <TableHead className="w-[30%] max-w-[30%]">Issue</TableHead>
                          <TableHead className="w-[30%] max-w-[30%]">Recommendation</TableHead>
                          <TableHead className="text-center w-[5%] max-w-[5%]">Severity</TableHead>
                          <TableHead className="text-center w-[5%] max-w-[5%]">Frequency</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {Object.entries(grouped).map(([category, items]) =>
                          items.map((item, idx) => (
                            <TableRow key={`${category}-${idx}`}>
                              {idx === 0 && (
                                <TableCell rowSpan={items.length}>{category}</TableCell>
                              )}

                              <TableCell className='!whitespace-normal break-words'>{item.issue}</TableCell>

                              <TableCell className='!whitespace-normal break-words'>{item.recommendation}</TableCell>

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
            </div>
            
            {filteredData.length > 0 && (
            <ScrollArea className="max-h-[600px] mx-2 overflow-auto border rounded-xl">
              <div className="min-w-[900px]">
                <Table>
                  <TableHeader>
                    <TableRow className='bg-stone-800'>
                      <TableHead className='text-lg font-semibold'>Date</TableHead>
                      <TableHead className='text-lg font-semibold'>Conduct</TableHead>
                      <TableHead className='text-lg font-semibold'>Pointers</TableHead>
                      <TableHead className='text-lg font-semibold'>Submitted By</TableHead>
                      <TableHead className='text-lg font-semibold'>Company</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.Date}</TableCell>
                        <TableCell>{row.Conduct_Name.toUpperCase()}</TableCell>
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
                        <TableCell className='text-center'>
                          {row.Company}
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