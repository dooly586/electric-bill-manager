import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileText, FileImage, Trash2, CheckCircle, AlertCircle, Settings, Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

// Define the data structure for parsed bills multi-month support
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

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [results, setResults] = useState<ParsedResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleSaveKey = (e: React.FormEvent) => {
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
         const file = files[i];
         const base64Data = await fileToBase64(file);
         const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

         const prompt = `당신은 전기요금 청구서에서 데이터를 추출하는 전문가입니다.
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
             generationConfig: {
               responseMimeType: "application/json"
             }
           })
         });

         if (!response.ok) {
           const errorData = await response.json();
           throw new Error(errorData.error?.message || 'Failed to communicate with API');
         }

         const data = await response.json();
         let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
         
         if (!text) throw new Error('No response from AI');
         
         // Clean up potential markdown formatting just in case
         text = text.replace(/^```json\s*/, '').replace(/```$/, '').trim();

         let parsed = JSON.parse(text);
         if (!Array.isArray(parsed)) {
           parsed = [parsed]; // fallback if the model doesn't return an array
         }

         updatedResults[i] = {
           fileName: file.name,
           status: 'success',
           data: parsed.map((item: any) => {
             if (item.companyName) {
               setCompanyName(prev => prev ? prev : item.companyName);
             }
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
         console.error('Error processing file:', files[i].name, error);
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex justify-between items-center text-white">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">전기요금 청구서 자동 분석기</h1>
            <p className="text-blue-100 text-sm mt-1">다중 개월의 요금 정보도 완벽히 분석하여 하나의 엑셀로 취합합니다</p>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-full hover:bg-white/20 transition-colors"
            title="Settings"
          >
            <Settings size={24} />
          </button>
        </div>

        {/* API Settings Panel */}
        {showSettings && (
          <div className="p-6 bg-blue-50 border-b border-blue-100">
            <h2 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Settings size={18} /> 설정
            </h2>
            <form onSubmit={handleSaveKey} className="flex gap-2">
              <input 
                type="password" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Gemini API Key 입력"
                className="flex-1 py-2 px-3 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <button 
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
              >
                저장
              </button>
            </form>
            <p className="text-xs text-blue-600 mt-2">
              Google AI Studio에서 발급받은 Gemini API 키가 필요합니다. 정보는 브라우저 로컬에만 저장됩니다.
            </p>
          </div>
        )}

        {/* Upload Area */}
        <div className="p-8">
          <div 
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${isDragging ? 'border-blue-500 bg-blue-100' : 'border-gray-300 bg-gray-50 hover:bg-blue-50'}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <UploadCloud size={48} className={`${isDragging ? 'text-blue-600' : 'text-blue-500'} mb-4`} />
            <h3 className="text-lg font-medium text-gray-800 mb-1">여기를 클릭하거나 파일을 드래그하여 업로드</h3>
            <p className="text-sm text-gray-500">여러 파일 업로드 가능. 단일 파일 내 다중월 내역 완벽 처리!</p>
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
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-800">업로드 내역 ({files.length})</h3>
                <div className="flex gap-2 flex-wrap justify-end">
                  <button 
                    onClick={processFiles}
                    disabled={isProcessing}
                    className={`flex items-center gap-2 ${isProcessing ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white py-2 px-4 rounded-lg font-medium transition-colors shadow-sm`}
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Settings size={18} />}
                    {isProcessing ? '분석 중...' : '데이터 분석 시작'}
                  </button>
                  <div className="flex items-center gap-2 border-l border-gray-300 pl-3 ml-1">
                    <input
                      type="text"
                      placeholder="업체명 (파일명 적용)"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="py-1.5 px-3 border border-gray-300 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-36"
                      title="입력된 업체명이 엑셀 파일명에 포함됩니다."
                    />
                    <button 
                      onClick={exportToExcel}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors shadow-sm"
                    >
                      <Download size={18} />
                      엑셀로 내보내기
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-50 text-gray-700 text-sm border-b border-gray-200">
                      <th className="py-3 px-4 w-12 text-center text-xs font-semibold uppercase tracking-wider">No</th>
                      <th className="py-3 px-4 w-48 text-xs font-semibold uppercase tracking-wider">상태 / 파일명</th>
                      <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider">세부 추출 내역 (월별 분리)</th>
                      <th className="py-3 px-4 w-16 text-center text-xs font-semibold uppercase tracking-wider">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                        <td className="py-4 px-4 text-center text-sm text-gray-400 font-medium align-top">{index + 1}</td>
                        <td className="py-4 px-4 align-top">
                          <div className="flex flex-col gap-2">
                            <div>
                               {result.status === 'pending' && <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md border border-gray-200"><Loader2 size={12} className="animate-spin" />대기중</span>}
                               {result.status === 'success' && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-md border border-green-200"><CheckCircle size={12} />완료 ({result.data?.length || 0}건)</span>}
                               {result.status === 'error' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-md border border-red-200" title={result.errorMessage}><AlertCircle size={12} />오류</span>}
                            </div>
                            <div className="flex items-start gap-2 text-sm font-medium text-gray-800">
                              {result.fileName.toLowerCase().endsWith('.pdf') ? 
                                <FileText size={16} className="text-red-500 shrink-0 mt-0.5" /> : 
                                <FileImage size={16} className="text-blue-500 shrink-0 mt-0.5" />
                              }
                              <span title={result.fileName} className="line-clamp-2 w-full text-xs text-gray-600 leading-tight">{result.fileName}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 align-top">
                          {result.status === 'success' && result.data && result.data.length > 0 ? (
                            <div className="flex flex-col gap-2">
                               {result.data.map((item, dIdx) => (
                                 <div key={dIdx} className="flex flex-wrap items-center gap-3 bg-white border border-blue-100 rounded-lg p-3 text-sm shadow-sm transition-all hover:border-blue-300">
                                   <div className="font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-100 tabular-nums">{item.billingMonth || '미상'}</div>
                                   <div className="text-gray-600 border-l-2 border-gray-100 pl-3 flex flex-col sm:flex-row sm:gap-4 sm:items-center">
                                     <span>사용량: <strong className="text-gray-900">{item.usageKwh !== null ? item.usageKwh.toLocaleString() : '-'} kWh</strong></span>
                                     <span className="hidden sm:inline text-gray-300">|</span>
                                     <span>청구금액: <strong className="text-indigo-600">₩{item.billAmountKrw !== null ? item.billAmountKrw.toLocaleString() : '-'}</strong></span>
                                   </div>
                                 </div>
                               ))}
                            </div>
                          ) : (
                             <div className="flex h-full items-center">
                               <span className="text-sm text-gray-400 italic flex items-center gap-2">
                                 {result.status === 'pending' ? <><Loader2 size={14} className="animate-spin text-blue-400"/> 데이터를 추출 대기 중입니다</> : 
                                  result.status === 'error' ? '추출에 실패했습니다. 형식이나 이미지를 확인해주세요.' : '추출된 데이터가 없습니다.'}
                               </span>
                             </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-center align-top">
                          <button 
                            onClick={() => removeFile(index)} 
                            className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all"
                            disabled={isProcessing}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
