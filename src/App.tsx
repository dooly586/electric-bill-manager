import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, FileImage, Trash2, CheckCircle, AlertCircle, Settings, Download, Loader2, Pencil, Check, X, RefreshCw, MessageSquarePlus } from 'lucide-react';
import * as XLSX from 'xlsx';

interface BillingData {
  billingMonth: string;
  usagePeriod: string;
  usageKwh: number | null;
  billAmountKrw: number | null;
  companyName?: string;
}

interface ParsedResult {
  fileName: string;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
  data?: BillingData[];
}

interface FileWithId extends File {
  id: string;
}

interface EditingCell {
  resultIndex: number;
  dataIndex: number;
  field: keyof BillingData;
  value: string;
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [results, setResults] = useState<ParsedResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [corrections, setCorrections] = useState<Record<number, string>>({});
  const [showCorrectionInput, setShowCorrectionInput] = useState<Record<number, boolean>>({});
  const [reanalyzingIndex, setReanalyzingIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingCell]);

  const handleSaveKey = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    localStorage.setItem('gemini_api_key', apiKey);
    setShowSettings(false);
    alert('API Key Saved!');
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let encoded = reader.result?.toString().replace(/^data:(.*,)?/, '') || '';
        if ((encoded.length % 4) > 0) {
          encoded += '='.repeat(4 - (encoded.length % 4));
        }
        resolve(encoded);
      };
      reader.onerror = error => reject(error);
    });
  };

  const buildPrompt = (correction?: string) => {
    const base = `당신은 전기요금 청구서에서 데이터를 추출하는 전문가입니다.
첨부된 청구서 파일(PDF 또는 이미지)에는 "여러 달"의 전기요금 내역이 포함되어 있을 수 있습니다.
각 달의 내역을 개별적으로 추출하여 반드시 JSON 배열(Array) 형식으로 반환하세요.
오직 마크다운 없이 JSON 배열 자체만 출력하세요. (\`\`\`json 제외)

배열 내 각 객체 추출 정보:
1. billingMonth (청구년월, 예: "2023-10", 문자열)
2. usagePeriod (사용기간, 문자열)
3. usageKwh (해당 월 사용량(kWh), 숫자만)
4. billAmountKrw (해당 월 청구금액(원), 숫자만)
5. companyName (청구서에 기재된 고객명, 업체명 또는 상호명, 문자열)

값을 찾을 수 없는 항목은 null로 설정하세요. 데이터가 1개월치만 있어도 단일 요소가 포함된 배열 형식으로 반환하세요.`;

    if (correction && correction.trim()) {
      return `${base}

[사용자 수정 요청사항 - 반드시 반영하세요]:
${correction.trim()}`;
    }
    return base;
  };

  const addFiles = (fileList: File[]) => {
    if (fileList.length > 0) {
      const newFiles = fileList.map(f => {
        const fileWithId = f as FileWithId;
        fileWithId.id = Math.random().toString(36).substring(7);
        return fileWithId;
      });
      setFiles(prev => [...prev, ...newFiles]);
      const newResults: ParsedResult[] = newFiles.map(f => ({
        fileName: f.name,
        status: 'pending'
      }));
      setResults(prev => [...prev, ...newResults]);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setResults(prev => prev.filter((_, i) => i !== index));
    setCorrections(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setShowCorrectionInput(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const callGeminiApi = async (file: File, prompt: string) => {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to communicate with API');
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from AI');
    text = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    let parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed;
  };

  const processFiles = async () => {
    if (!apiKey) {
      alert('Please configure your Gemini API Key in the settings first.');
      setShowSettings(true);
      return;
    }
    if (files.length === 0) return;
    setIsProcessing(true);
    const updatedResults = [...results];

    for (let i = 0; i < files.length; i++) {
      if (updatedResults[i].status === 'success') continue;
      try {
        const parsed = await callGeminiApi(files[i], buildPrompt());
        updatedResults[i] = {
          fileName: files[i].name,
          status: 'success',
          data: parsed.map((item: any) => {
            if (item.companyName) setCompanyName(prev => prev ? prev : item.companyName);
            return {
              billingMonth: item.billingMonth || '',
              usagePeriod: item.usagePeriod || '',
              usageKwh: typeof item.usageKwh === 'number' ? item.usageKwh : null,
              billAmountKrw: typeof item.billAmountKrw === 'number' ? item.billAmountKrw : null,
              companyName: item.companyName || ''
            };
          })
        };
      } catch (error: any) {
        updatedResults[i] = {
          fileName: files[i].name,
          status: 'error',
          errorMessage: error.message || 'Unknown error occurred'
        };
      }
      setResults([...updatedResults]);
    }
    setIsProcessing(false);
  };

  // 수정사항 반영하여 단일 파일 재분석
  const reanalyzeFile = async (index: number) => {
    if (!apiKey) {
      alert('Please configure your Gemini API Key in the settings first.');
      setShowSettings(true);
      return;
    }
    const correction = corrections[index] || '';
    setReanalyzingIndex(index);

    try {
      const parsed = await callGeminiApi(files[index], buildPrompt(correction));
      setResults(prev => {
        const next = [...prev];
        next[index] = {
          fileName: files[index].name,
          status: 'success',
          data: parsed.map((item: any) => ({
            billingMonth: item.billingMonth || '',
            usagePeriod: item.usagePeriod || '',
            usageKwh: typeof item.usageKwh === 'number' ? item.usageKwh : null,
            billAmountKrw: typeof item.billAmountKrw === 'number' ? item.billAmountKrw : null,
            companyName: item.companyName || ''
          }))
        };
        return next;
      });
      // 재분석 완료 후 수정사항 입력란 닫기
      setShowCorrectionInput(prev => ({ ...prev, [index]: false }));
      setCorrections(prev => ({ ...prev, [index]: '' }));
    } catch (error: any) {
      setResults(prev => {
        const next = [...prev];
        next[index] = {
          fileName: files[index].name,
          status: 'error',
          errorMessage: error.message || 'Unknown error occurred'
        };
        return next;
      });
    }
    setReanalyzingIndex(null);
  };

  // 인라인 편집 - 셀 수정 저장
  const commitEdit = () => {
    if (!editingCell) return;
    const { resultIndex, dataIndex, field, value } = editingCell;
    setResults(prev => {
      const next = [...prev];
      const item = { ...next[resultIndex].data![dataIndex] };
      if (field === 'usageKwh' || field === 'billAmountKrw') {
        const num = parseFloat(value.replace(/,/g, ''));
        (item as any)[field] = isNaN(num) ? null : num;
      } else {
        (item as any)[field] = value;
      }
      const newData = [...next[resultIndex].data!];
      newData[dataIndex] = item;
      next[resultIndex] = { ...next[resultIndex], data: newData };
      return next;
    });
    setEditingCell(null);
  };

  const startEdit = (resultIndex: number, dataIndex: number, field: keyof BillingData, currentValue: any) => {
    setEditingCell({
      resultIndex,
      dataIndex,
      field,
      value: currentValue !== null && currentValue !== undefined ? String(currentValue) : ''
    });
  };

  const exportToExcel = () => {
    const successResults = results.filter(r => r.status === 'success' && r.data && r.data.length > 0);
    if (successResults.length === 0) {
      alert('성공적으로 추출된 데이터가 없습니다.');
      return;
    }
    const excelData = successResults.flatMap(r =>
      r.data!.map(item => ({
        '년월': item.billingMonth,
        '사용기간': item.usagePeriod,
        '사용량(kwh)': item.usageKwh,
        '요금(월)': item.billAmountKrw,
        '비고': ''
      }))
    );
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '세부_전기요금_정리');
    const finalFileName = companyName.trim()
      ? `${companyName.trim()}_전기요금_정리_통합본.xlsx`
      : '전기요금_정리_통합본.xlsx';
    XLSX.writeFile(workbook, finalFileName);
  };

  // 편집 가능한 필드 셀 렌더링
  const EditableField = ({
    label, value, resultIndex, dataIndex, field, prefix = '', suffix = '', numeric = false
  }: {
    label: string; value: any; resultIndex: number; dataIndex: number;
    field: keyof BillingData; prefix?: string; suffix?: string; numeric?: boolean;
  }) => {
    const isEditing = editingCell?.resultIndex === resultIndex &&
      editingCell?.dataIndex === dataIndex &&
      editingCell?.field === field;

    const displayValue = value !== null && value !== undefined
      ? numeric ? Number(value).toLocaleString() : value
      : '-';

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">{prefix}</span>
          <input
            ref={editInputRef}
            type="text"
            value={editingCell.value}
            onChange={e => setEditingCell({ ...editingCell, value: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditingCell(null);
            }}
            className="border border-blue-400 rounded px-1.5 py-0.5 text-xs w-24 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className="text-gray-400 text-xs">{suffix}</span>
          <button onClick={commitEdit} className="text-green-600 hover:text-green-700 p-0.5"><Check size={13} /></button>
          <button onClick={() => setEditingCell(null)} className="text-gray-400 hover:text-gray-600 p-0.5"><X size={13} /></button>
        </div>
      );
    }

    return (
      <button
        onClick={() => startEdit(resultIndex, dataIndex, field, value)}
        className="group/edit flex items-center gap-1 hover:bg-gray-100 rounded px-1 py-0.5 transition-colors text-left"
        title={`${label} 수정`}
      >
        <span>{prefix}{displayValue}{suffix && displayValue !== '-' ? suffix : ''}</span>
        <Pencil size={11} className="text-gray-300 group-hover/edit:text-blue-400 shrink-0 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
      </button>
    );
  };

  // 수정사항 + 재분석 패널
  const CorrectionPanel = ({ index }: { index: number }) => {
    const isOpen = showCorrectionInput[index];
    const isReanalyzing = reanalyzingIndex === index;

    return (
      <div className="mt-2">
        {!isOpen ? (
          <button
            onClick={() => setShowCorrectionInput(prev => ({ ...prev, [index]: true }))}
            className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1.5 rounded-lg transition-colors border border-amber-200 hover:border-amber-300"
          >
            <MessageSquarePlus size={13} />
            수정사항 입력 후 재분석
          </button>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                <MessageSquarePlus size={13} />
                수정사항 입력
              </span>
              <button
                onClick={() => setShowCorrectionInput(prev => ({ ...prev, [index]: false }))}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              value={corrections[index] || ''}
              onChange={e => setCorrections(prev => ({ ...prev, [index]: e.target.value }))}
              placeholder={`예시:\n- 2023-11 청구금액이 누락됨\n- 사용기간 날짜가 잘못 추출됨\n- 3개월치 데이터가 있는데 1개만 추출됨`}
              rows={4}
              className="w-full text-xs px-2.5 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none placeholder:text-gray-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => reanalyzeFile(index)}
                disabled={isReanalyzing || !corrections[index]?.trim()}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isReanalyzing || !corrections[index]?.trim()
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                {isReanalyzing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {isReanalyzing ? '재분석 중...' : '수정사항 반영하여 재분석'}
              </button>
            </div>
            <p className="text-xs text-amber-600">
              💡 수정사항을 자세히 적을수록 정확하게 재분석됩니다
            </p>
          </div>
        )}
      </div>
    );
  };

  // 월별 데이터 카드 (공용)
  const BillingItemCard = ({ item, resultIndex, dataIndex, compact = false }: {
    item: BillingData; resultIndex: number; dataIndex: number; compact?: boolean;
  }) => (
    <div className={`border border-blue-100 rounded-lg ${compact ? 'p-2.5' : 'p-3'} bg-white shadow-sm hover:border-blue-300 transition-colors`}>
      <div className={`flex flex-wrap items-center gap-${compact ? '2' : '3'}`}>
        {/* 년월 */}
        <div className="font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 tabular-nums text-sm">
          <EditableField
            label="년월" value={item.billingMonth} field="billingMonth"
            resultIndex={resultIndex} dataIndex={dataIndex}
          />
        </div>
        {/* 사용량, 청구금액 */}
        <div className="text-gray-600 border-l-2 border-gray-100 pl-3 flex flex-col sm:flex-row sm:gap-4 sm:items-center text-sm">
          <span>사용량:{' '}
            <strong className="text-gray-900">
              <EditableField
                label="사용량" value={item.usageKwh} field="usageKwh"
                resultIndex={resultIndex} dataIndex={dataIndex} suffix=" kWh" numeric
              />
            </strong>
          </span>
          <span className="hidden sm:inline text-gray-300">|</span>
          <span>청구금액:{' '}
            <strong className="text-indigo-600">
              <EditableField
                label="청구금액" value={item.billAmountKrw} field="billAmountKrw"
                resultIndex={resultIndex} dataIndex={dataIndex} prefix="₩" numeric
              />
            </strong>
          </span>
        </div>
      </div>
      {/* 사용기간 (작게) */}
      {item.usagePeriod && (
        <div className="mt-1.5 text-xs text-gray-400 pl-1">
          기간:{' '}
          <EditableField
            label="사용기간" value={item.usagePeriod} field="usagePeriod"
            resultIndex={resultIndex} dataIndex={dataIndex}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-4 md:py-10 px-2 sm:px-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-white">
          <div className="flex-1">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">전기요금 청구서 자동 분석기</h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-1">다중 개월의 요금 정보도 완벽히 분석하여 하나의 엑셀로 취합합니다</p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 rounded-full hover:bg-white/20 transition-colors self-end sm:self-auto"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* API Settings Panel */}
        {showSettings && (
          <div className="p-4 sm:p-6 bg-blue-50 border-b border-blue-100">
            <h2 className="text-base sm:text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Settings size={16} /> 설정
            </h2>
            <form onSubmit={handleSaveKey} className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Gemini API Key 입력"
                className="flex-1 py-2.5 sm:py-2 px-3 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                required
              />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 sm:py-2 px-4 rounded-lg font-medium transition-colors text-sm">
                저장
              </button>
            </form>
            <p className="text-xs text-blue-600 mt-2">
              Google AI Studio에서 발급받은 Gemini API 키가 필요합니다. 정보는 브라우저 로컬에만 저장됩니다.
            </p>
          </div>
        )}

        {/* Upload Area */}
        <div className="p-4 sm:p-8">
          <div
            className={`border-2 border-dashed rounded-xl p-6 sm:p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-100' : 'border-gray-300 bg-gray-50 hover:bg-blue-50'}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <UploadCloud size={40} className={`${isDragging ? 'text-blue-600' : 'text-blue-500'} mb-3 sm:mb-4`} />
            <h3 className="text-base sm:text-lg font-medium text-gray-800 mb-1 text-center px-2">여기를 클릭하거나 파일을 드래그하여 업로드</h3>
            <p className="text-xs sm:text-sm text-gray-500 text-center px-2">여러 파일 업로드 가능. 단일 파일 내 다중월 내역 완벽 처리!</p>
            <input
              type="file"
              multiple
              onChange={onFileSelect}
              className="hidden"
              ref={fileInputRef}
              accept="application/pdf,image/jpeg,image/png,image/webp"
            />
          </div>

          {/* Files / Results List */}
          {files.length > 0 && (
            <div className="mt-6 sm:mt-8">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                <h3 className="text-base sm:text-lg font-medium text-gray-800">업로드 내역 ({files.length})</h3>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <button
                    onClick={processFiles}
                    disabled={isProcessing}
                    className={`flex items-center justify-center gap-2 ${isProcessing ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'} text-white py-3 sm:py-2 px-4 rounded-lg font-medium transition-colors shadow-sm text-sm touch-manipulation`}
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Settings size={18} />}
                    {isProcessing ? '분석 중...' : '데이터 분석 시작'}
                  </button>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:border-l sm:border-gray-300 sm:pl-3 sm:ml-1">
                    <input
                      type="text"
                      placeholder="업체명 (파일명 적용)"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="py-2.5 sm:py-1.5 px-3 border border-gray-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full sm:w-36"
                    />
                    <button
                      onClick={exportToExcel}
                      className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white py-3 sm:py-2 px-4 rounded-lg font-medium transition-colors shadow-sm text-sm touch-manipulation"
                    >
                      <Download size={18} />
                      엑셀로 내보내기
                    </button>
                  </div>
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-50 text-gray-700 border-b border-gray-200">
                      <th className="py-3 px-4 w-10 text-center text-xs font-semibold uppercase tracking-wider">No</th>
                      <th className="py-3 px-4 w-44 text-xs font-semibold uppercase tracking-wider">상태 / 파일명</th>
                      <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider">세부 추출 내역 (월별 분리) — 항목을 클릭하여 수정</th>
                      <th className="py-3 px-4 w-14 text-center text-xs font-semibold uppercase tracking-wider">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-4 text-center text-sm text-gray-400 font-medium align-top">{index + 1}</td>
                        <td className="py-4 px-4 align-top">
                          <div className="flex flex-col gap-2">
                            <div>
                              {result.status === 'pending' && <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md border border-gray-200"><Loader2 size={12} className="animate-spin" />대기중</span>}
                              {result.status === 'success' && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-md border border-green-200"><CheckCircle size={12} />완료 ({result.data?.length || 0}건)</span>}
                              {result.status === 'error' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-md border border-red-200"><AlertCircle size={12} />오류</span>}
                            </div>
                            <div className="flex items-start gap-2">
                              {result.fileName.toLowerCase().endsWith('.pdf')
                                ? <FileText size={15} className="text-red-500 shrink-0 mt-0.5" />
                                : <FileImage size={15} className="text-blue-500 shrink-0 mt-0.5" />}
                              <span className="line-clamp-2 text-xs text-gray-600 leading-tight">{result.fileName}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 align-top">
                          {result.status === 'success' && result.data && result.data.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {result.data.map((item, dIdx) => (
                                <BillingItemCard key={dIdx} item={item} resultIndex={index} dataIndex={dIdx} compact />
                              ))}
                              <CorrectionPanel index={index} />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <span className="text-sm text-gray-400 italic flex items-center gap-2">
                                {result.status === 'pending'
                                  ? <><Loader2 size={14} className="animate-spin text-blue-400" /> 데이터를 추출 대기 중입니다</>
                                  : result.status === 'error'
                                    ? '추출에 실패했습니다. 형식이나 이미지를 확인해주세요.'
                                    : '추출된 데이터가 없습니다.'}
                              </span>
                              {result.status === 'error' && <CorrectionPanel index={index} />}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center align-top">
                          <button
                            onClick={() => removeFile(index)}
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                            disabled={isProcessing || reanalyzingIndex === index}
                            title="삭제"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden flex flex-col gap-3">
                {results.map((result, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-gray-400">#{index + 1}</span>
                          {result.status === 'pending' && <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md border border-gray-200"><Loader2 size={12} className="animate-spin" />대기중</span>}
                          {result.status === 'success' && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-md border border-green-200"><CheckCircle size={12} />완료 ({result.data?.length || 0}건)</span>}
                          {result.status === 'error' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-md border border-red-200"><AlertCircle size={12} />오류</span>}
                        </div>
                        <div className="flex items-start gap-2">
                          {result.fileName.toLowerCase().endsWith('.pdf')
                            ? <FileText size={18} className="text-red-500 shrink-0 mt-0.5" />
                            : <FileImage size={18} className="text-blue-500 shrink-0 mt-0.5" />}
                          <span className="text-sm text-gray-700 font-medium break-all">{result.fileName}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-gray-400 hover:text-red-500 active:text-red-600 p-2 rounded-lg transition-all touch-manipulation ml-2"
                        disabled={isProcessing || reanalyzingIndex === index}
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>

                    <div className="space-y-2">
                      {result.status === 'success' && result.data && result.data.length > 0 ? (
                        <>
                          {result.data.map((item, dIdx) => (
                            <div key={dIdx} className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3">
                              <div className="font-bold text-blue-700 text-sm mb-2">
                                <EditableField
                                  label="년월" value={item.billingMonth} field="billingMonth"
                                  resultIndex={index} dataIndex={dIdx}
                                />
                              </div>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600">사용량</span>
                                  <strong className="text-gray-900">
                                    <EditableField
                                      label="사용량" value={item.usageKwh} field="usageKwh"
                                      resultIndex={index} dataIndex={dIdx} suffix=" kWh" numeric
                                    />
                                  </strong>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600">청구금액</span>
                                  <strong className="text-indigo-600">
                                    <EditableField
                                      label="청구금액" value={item.billAmountKrw} field="billAmountKrw"
                                      resultIndex={index} dataIndex={dIdx} prefix="₩" numeric
                                    />
                                  </strong>
                                </div>
                                {item.usagePeriod && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-600">사용기간</span>
                                    <span className="text-gray-700">
                                      <EditableField
                                        label="사용기간" value={item.usagePeriod} field="usagePeriod"
                                        resultIndex={index} dataIndex={dIdx}
                                      />
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          <CorrectionPanel index={index} />
                        </>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-center py-3">
                            <span className="text-sm text-gray-400 italic flex items-center gap-2">
                              {result.status === 'pending'
                                ? <><Loader2 size={14} className="animate-spin text-blue-400" /> 데이터 추출 대기 중</>
                                : result.status === 'error'
                                  ? '추출 실패. 형식 확인 필요'
                                  : '추출된 데이터 없음'}
                            </span>
                          </div>
                          {result.status === 'error' && <CorrectionPanel index={index} />}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* 편집 안내 문구 */}
              {results.some(r => r.status === 'success') && (
                <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                  <Pencil size={11} />
                  데이터를 클릭하면 직접 수정할 수 있습니다. 누락되거나 잘못된 경우 "수정사항 입력 후 재분석"을 이용하세요.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
