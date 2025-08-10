const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// 임시 파일 저장 디렉토리
const getOutputDir = () => '/tmp';

// 날짜/시간 필드 식별
function isDateTimeField(fieldName) {
  const dateTimeKeywords = [
    '날짜', '시간', '일시', '시각', '접수일', '주문일', '발주일', '배송일',
    'date', 'time', 'datetime', 'timestamp', 'created', 'updated',
    '등록일', '수정일', '완료일', '처리일', '입력일'
  ];
  
  if (!fieldName) return false;
  
  const lowerFieldName = fieldName.toString().toLowerCase();
  return dateTimeKeywords.some(keyword => lowerFieldName.includes(keyword.toLowerCase()));
}

// 날짜/시간 데이터 보존
function preserveDateTimeFormat(value, fieldName) {
  if (!value || !isDateTimeField(fieldName)) return value;
  
  if (typeof value === 'string') return value;
  
  if (value instanceof Date) {
    const hasTime = value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
    return hasTime 
      ? value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
      : value.toISOString().split('T')[0];
  }
  
  if (typeof value === 'number') {
    try {
      const excelDate = new Date((value - 25569) * 86400 * 1000);
      const hasTime = (value % 1) !== 0;
      return hasTime 
        ? excelDate.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
        : excelDate.toISOString().split('T')[0];
    } catch (error) {
      console.warn('날짜 변환 오류:', error.message);
      return value;
    }
  }
  
  return value;
}

// 주문서를 표준 발주서로 변환
async function convertToStandardFormat(sourceFilePath, templateFilePath, mappingRules, manualFields = {}) {
  try {
    const outputDir = getOutputDir();
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const sourceData = await readSourceFile(sourceFilePath);
    const result = await generatePurchaseOrder(templateFilePath, sourceData, mappingRules, manualFields);
    
    return result;
    
  } catch (error) {
    console.error('변환 처리 오류:', error);
    throw new Error(`파일 변환 중 오류가 발생했습니다: ${error.message}`);
  }
}

// 📖 원본 파일 읽기 (Excel 또는 CSV)
async function readSourceFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  
  if (extension === '.csv') {
    return await readCSVFile(filePath);
  } else {
    return await readExcelFile(filePath);
  }
}

// Excel 파일 읽기
async function readExcelFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  const fileSizeMB = stats.size / 1024 / 1024;
  const fileExtension = path.extname(filePath).toLowerCase();
  
  // 플랫폼별 파일 크기 제한
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = process.env.VERCEL === '1';
  
  const maxFileSize = isVercel ? 10 : 50;
  
  if (fileSizeMB > maxFileSize) {
    throw new Error(`파일 크기가 너무 큽니다. ${maxFileSize}MB 이하의 파일을 업로드해주세요. (현재: ${fileSizeMB.toFixed(1)}MB)`);
  }
  
  // XLS 파일 처리
  if (fileExtension === '.xls') {
    if (isProduction) {
      try {
        const xlsTimeout = isVercel ? 5000 : 10000;
        return await Promise.race([
          readExcelFileWithXLSXOptimized(filePath),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`XLS 파일 처리 시간 초과`)), xlsTimeout)
          )
        ]);
      } catch (xlsError) {
        throw new Error(`구형 Excel 파일(.xls)은 지원이 제한적입니다. 파일을 .xlsx 형식으로 변환해주세요.`);
      }
    }
  }
  
  // XLSX 파일 처리
  try {
    const xlsxTimeout = isVercel ? 15000 : 60000;
    return await Promise.race([
      readExcelFileWithXLSX(filePath),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Excel 파일 처리 시간 초과`)), xlsxTimeout)
      )
    ]);
  } catch (xlsxError) {
    if (isProduction && fileExtension === '.xls') {
      throw new Error(`구형 Excel 파일(.xls) 처리에 실패했습니다. 파일을 .xlsx 형식으로 변환 후 다시 시도해주세요.`);
    }
    
    // ExcelJS fallback
    try {
      const exceljsTimeout = isVercel ? 10000 : 30000;
      return await Promise.race([
        readExcelFileWithExcelJS(filePath),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`ExcelJS 처리 시간 초과`)), exceljsTimeout)
        )
      ]);
    } catch (exceljsError) {
      throw new Error(`Excel 파일을 읽을 수 없습니다: ${exceljsError.message}`);
    }
  }
}

// 구형 XLS 파일 최적화 읽기
async function readExcelFileWithXLSXOptimized(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    const workbook = XLSX.read(fileBuffer, {
      type: 'buffer',
      cellText: true,
      cellDates: false,
      raw: true,
      codepage: 949,
      sheetStubs: false,
      bookVBA: false,
      bookFiles: false,
      bookProps: false,
      bookSheets: false,
      bookDeps: false,
      dense: false
    });
    
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('워크시트를 찾을 수 없습니다.');
    }
    
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      raw: false, 
      defval: '',
      blankrows: false
    });
    
    // 헤더 찾기
    let headers = [];
    let headerRowIndex = 0;
    
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
      const row = jsonData[i];
      if (row && row.length > 2) {
        const nonEmptyCount = row.filter(cell => cell && cell.toString().trim() !== '').length;
        if (nonEmptyCount >= 3) {
          headers = row.filter(cell => cell && cell.toString().trim() !== '')
                      .map(cell => cell.toString().trim());
          headerRowIndex = i;
          break;
        }
      }
    }
    
    if (headers.length === 0) {
      throw new Error('헤더를 찾을 수 없습니다.');
    }
    
    // 데이터 처리
    const data = [];
    const maxRows = Math.min(500, jsonData.length);
    
    for (let i = headerRowIndex + 1; i < maxRows; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;
      
      const rowData = {};
      headers.forEach((header, index) => {
        const value = row[index] ? row[index].toString().trim() : '';
        rowData[header] = value;
      });
      
      if (Object.values(rowData).some(value => value !== '')) {
        data.push(rowData);
      }
    }
    
    return { headers, data };
    
  } catch (error) {
    throw error;
  }
}

// XLSX 라이브러리로 Excel 파일 읽기
async function readExcelFileWithXLSX(filePath) {
  const fileExtension = path.extname(filePath).toLowerCase();
  let workbook;
  
  if (fileExtension === '.xls') {
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      throw new Error('Production 환경에서는 구형 XLS 파일 처리가 제한됩니다. 파일을 XLSX 형식으로 변환해주세요.');
    }
    
    try {
      const fileBuffer = fs.readFileSync(filePath);
      
      workbook = XLSX.read(fileBuffer, {
        type: 'buffer',
        cellText: true,
        cellDates: false,
        raw: true,
        codepage: 949,
        sheetStubs: false,
        bookVBA: false
      });
      
    } catch (xlsError) {
      throw new Error(`구형 Excel 파일(.xls) 처리에 실패했습니다. 파일을 .xlsx 형식으로 저장 후 다시 시도해주세요.`);
    }
  } else {
    workbook = XLSX.readFile(filePath, {
      cellText: false,
      cellDates: true,
      raw: false,
      type: 'file',
      dateNF: 'yyyy-mm-dd hh:mm:ss'
    });
  }
  
  // 적합한 워크시트 찾기
  let bestSheetName = workbook.SheetNames[0];
  let bestScore = 0;
  
  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const rowCount = range.e.r + 1;
    const colCount = range.e.c + 1;
    
    if (rowCount < 2 || colCount === 0) return;
    
    let score = 0;
    const lowerSheetName = sheetName.toLowerCase();
    if (lowerSheetName.includes('sheet') || lowerSheetName.includes('데이터') || lowerSheetName.includes('주문')) {
      score += 10;
    }
    if (lowerSheetName.includes('요약') || lowerSheetName.includes('피벗')) {
      score -= 20;
    }
    score += Math.min(rowCount / 10, 20);
    score += Math.min(colCount, 10);
    
    if (score > bestScore) {
      bestScore = score;
      bestSheetName = sheetName;
    }
  });
  
  const worksheet = workbook.Sheets[bestSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, 
    raw: false, 
    defval: '',
    dateNF: 'yyyy-mm-dd hh:mm:ss'
  });
  
  // 헤더 행 찾기
  let headerRowIndex = 0;
  let bestHeaderScore = 0;
  
  for (let i = 0; i < Math.min(10, jsonData.length); i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    
    let score = 0;
    const nonEmptyValues = row.filter(cell => cell && cell.toString().trim() !== '');
    
    if (nonEmptyValues.length >= 2) {
      nonEmptyValues.forEach(cell => {
        const cellValue = cell.toString().trim().toLowerCase();
        if (cellValue.includes('상품') || cellValue.includes('제품') || cellValue.includes('품목')) score += 10;
        if (cellValue.includes('수량') || cellValue.includes('qty')) score += 10;
        if (cellValue.includes('가격') || cellValue.includes('단가') || cellValue.includes('price')) score += 10;
        if (cellValue.includes('고객') || cellValue.includes('주문자') || cellValue.includes('이름')) score += 8;
        if (cellValue.includes('연락') || cellValue.includes('전화') || cellValue.includes('휴대폰')) score += 8;
        if (cellValue.includes('주소') || cellValue.includes('배송')) score += 8;
        if (cellValue.length > 0 && cellValue.length <= 10) score += 1;
      });
      
      score += nonEmptyValues.length;
      
      if (score > bestHeaderScore) {
        bestHeaderScore = score;
        headerRowIndex = i;
      }
    }
  }
  
  if (bestHeaderScore < 10) {
    throw new Error('적절한 헤더 행을 찾을 수 없습니다.');
  }
  
  const headers = jsonData[headerRowIndex]
    .filter(cell => cell && cell.toString().trim() !== '')
    .map(cell => cell.toString().trim());
  
  // 데이터 행 처리
  const data = [];
  for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    
    const rowData = {};
    headers.forEach((header, index) => {
      let value = row[index] ? row[index].toString().trim() : '';
      
      if (isDateTimeField(header)) {
        value = preserveDateTimeFormat(row[index], header);
      }
      
      rowData[header] = value;
    });
    
    if (Object.values(rowData).some(value => value !== '')) {
      data.push(rowData);
    }
  }
  
  return { headers, data };
}

// ExcelJS로 Excel 파일 읽기
async function readExcelFileWithExcelJS(filePath) {
  const workbook = new ExcelJS.Workbook();
  
  // 메타데이터 설정
  workbook.creator = 'AutoOrder System';
  workbook.company = 'AutoOrder';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  // 최적화된 옵션으로 파일 읽기
  const readOptions = {
    sharedStrings: 'ignore',
    hyperlinks: 'ignore',
    worksheets: 'emit',
    styles: 'ignore',
    pictures: 'ignore',
    charts: 'ignore'
  };
  
  if (isProduction) {
    readOptions.merges = 'ignore';
    readOptions.conditionalFormattings = 'ignore';
    readOptions.dataValidations = 'ignore';
  }
  
  await workbook.xlsx.readFile(filePath, readOptions);
  
  // 적합한 워크시트 찾기
  let bestWorksheet = null;
  let bestScore = 0;
  
  try {
    workbook.worksheets.forEach((worksheet) => {
      if (worksheet.rowCount < 2 || worksheet.columnCount === 0) return;
      
      let score = 0;
      const sheetName = worksheet.name.toLowerCase();
      if (sheetName.includes('sheet') || sheetName.includes('데이터') || sheetName.includes('주문')) {
        score += 10;
      }
      if (sheetName.includes('요약') || sheetName.includes('피벗')) {
        score -= 20;
      }
      
      score += Math.min(worksheet.rowCount / 10, 20);
      score += Math.min(worksheet.columnCount, 10);
      
      if (score > bestScore) {
        bestScore = score;
        bestWorksheet = worksheet;
      }
    });
  } catch (worksheetError) {
    bestWorksheet = workbook.getWorksheet(1);
  }
  
  if (!bestWorksheet) {
    throw new Error('적절한 워크시트를 찾을 수 없습니다.');
  }
  
  // 헤더 행 찾기
  let headerRowNum = 1;
  let headers = [];
  let maxHeaderScore = 0;
  
  const maxRowsToCheck = Math.min(10, bestWorksheet.rowCount);
  
  for (let rowNumber = 1; rowNumber <= maxRowsToCheck; rowNumber++) {
    try {
      const row = bestWorksheet.getRow(rowNumber);
      const potentialHeaders = [];
      let headerScore = 0;
      
      const maxColumnsToCheck = Math.min(50, bestWorksheet.columnCount);
      for (let colNumber = 1; colNumber <= maxColumnsToCheck; colNumber++) {
        try {
          const cell = row.getCell(colNumber);
          const value = cell.value ? cell.value.toString().trim() : '';
          potentialHeaders.push(value);
          
          if (value) {
            if (value.includes('상품') || value.includes('제품') || value.includes('품목')) headerScore += 10;
            if (value.includes('수량') || value.includes('qty')) headerScore += 10;
            if (value.includes('가격') || value.includes('단가') || value.includes('price')) headerScore += 10;
            if (value.includes('고객') || value.includes('주문자') || value.includes('이름')) headerScore += 8;
            if (value.includes('연락') || value.includes('전화') || value.includes('휴대폰')) headerScore += 8;
            if (value.includes('주소') || value.includes('배송')) headerScore += 8;
            if (value.includes('이메일') || value.includes('email')) headerScore += 5;
            if (value.length > 0) headerScore += 1;
          }
        } catch (cellError) {
          potentialHeaders.push('');
        }
      }
      
      if (headerScore > maxHeaderScore && headerScore > 5) {
        maxHeaderScore = headerScore;
        headerRowNum = rowNumber;
        headers = potentialHeaders.filter(h => h !== '');
      }
    } catch (rowError) {
      // 행 처리 중 오류 무시
    }
  }
  
  if (headers.length === 0) {
    for (let colNumber = 1; colNumber <= bestWorksheet.columnCount; colNumber++) {
      headers.push(`컬럼${colNumber}`);
    }
    headerRowNum = 0;
  }
  
  // 데이터 읽기
  const data = [];
  const dataStartRow = headerRowNum + 1;
  const maxRowLimit = isProduction ? 1000 : 5000;
  const maxRowsToProcess = Math.min(bestWorksheet.rowCount, maxRowLimit);
  
  for (let rowNumber = dataStartRow; rowNumber <= maxRowsToProcess; rowNumber++) {
    try {
      const row = bestWorksheet.getRow(rowNumber);
      const rowData = {};
      
      headers.forEach((header, index) => {
        try {
          const cell = row.getCell(index + 1);
          const value = cell.value ? cell.value.toString().trim() : '';
          rowData[header] = value;
        } catch (cellError) {
          rowData[header] = '';
        }
      });
      
      if (Object.values(rowData).some(value => value !== '')) {
        data.push(rowData);
      }
    } catch (rowError) {
      // 행 처리 중 오류 무시
    }
  }
  
  return { headers, data };
}

// CSV 파일 읽기
async function readCSVFile(filePath) {
  const csvData = fs.readFileSync(filePath, 'utf8');
  const lines = csvData.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV 파일이 비어있습니다.');
  }
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const rowData = {};
    
    headers.forEach((header, index) => {
      rowData[header] = values[index] || '';
    });
    
    if (Object.values(rowData).some(value => value !== '')) {
      data.push(rowData);
    }
  }
  
  return { headers, data };
}



// 발주서 생성
async function generatePurchaseOrder(templateFilePath, sourceData, mappingRules = {}, manualFields = {}) {
  const outputDir = getOutputDir();
  const workbook = new ExcelJS.Workbook();
  
  // 메타데이터 설정
  workbook.creator = 'AutoOrder System';
  workbook.company = 'AutoOrder';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  let templateFields = [];
  
  // ✅ 발주서 템플릿 파일에서 원본 헤더 구조 읽기 (올바른 방식)
  try {
    if (fs.existsSync(templateFilePath)) {
      templateFields = await extractHeadersWithXLSX(templateFilePath);
      console.log('✅ 발주서 템플릿에서 원본 헤더 구조 읽기:', templateFields);
      
      // 수동 필드들을 기존 템플릿 필드에 추가 (중복 방지)
      if (manualFields && Object.keys(manualFields).length > 0) {
        const manualFieldNames = Object.keys(manualFields);
        const newManualFields = manualFieldNames.filter(field => !templateFields.includes(field));
        if (newManualFields.length > 0) {
          templateFields = [...templateFields, ...newManualFields];
          console.log('📝 새로운 수동 필드들 추가:', newManualFields);
        }
      }
    } else {
      throw new Error('발주서 템플릿 파일을 찾을 수 없습니다: ' + templateFilePath);
    }
  } catch (templateError) {
    console.error('❌ 템플릿 파일 읽기 오류:', templateError.message);
    throw new Error('발주서 템플릿 파일을 읽을 수 없습니다: ' + templateError.message);
  }
  
  if (templateFields.length === 0) {
    throw new Error('발주서 필드를 찾을 수 없습니다. 매핑 규칙이나 템플릿 파일을 확인해주세요.');
  }
  
  // 📋 매핑 규칙 정리 (rules 변수 정의)
  let rules = {};
  if (mappingRules && mappingRules.rules) {
    rules = mappingRules.rules;
  } else if (mappingRules && typeof mappingRules === 'object' && !Array.isArray(mappingRules)) {
    rules = mappingRules;
  }
  
  console.log('📋 매핑 규칙 확인:', {
    mappingRules타입: typeof mappingRules,
    rules개수: Object.keys(rules).length,
    rules내용: rules
  });
  
  // 새 워크북 생성
  if (workbook.worksheets.length > 0) {
    workbook.removeWorksheet(workbook.getWorksheet(1));
  }
  const newWorksheet = workbook.addWorksheet('발주서');
  
  // 헤더 행 생성
  const headerRow = newWorksheet.getRow(1);
  templateFields.forEach((field, index) => {
    headerRow.getCell(index + 1).value = field;
    headerRow.getCell(index + 1).font = { bold: true };
    headerRow.getCell(index + 1).fill = { 
      type: 'pattern', 
      pattern: 'solid', 
      fgColor: { argb: 'FFE0E0E0' } 
    };
    headerRow.getCell(index + 1).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  const worksheet = workbook.getWorksheet(1);
  const { headers: orderHeaders, data: orderData } = sourceData;
  
  // 매핑 규칙 정리 (이미 560행에서 처리됨)
  
  // 데이터 처리
  const dataStartRow = 2;
  const errors = [];
  const processedRows = [];
  
  orderData.forEach((rowData, index) => {
    try {
      const dataRow = worksheet.getRow(dataStartRow + index);
      
      // 데이터를 객체로 변환
      let orderRowObject = {};
      
      if (Array.isArray(rowData)) {
        orderHeaders.forEach((header, headerIndex) => {
          orderRowObject[header] = rowData[headerIndex] || '';
        });
      } else if (typeof rowData === 'object' && rowData !== null) {
        orderRowObject = rowData;
      } else {
        return;
      }
      
      const processedRow = {};
      
      templateFields.forEach((supplierField, colIndex) => {
        let value = '';
        
        // 1. 수동 필드 우선 적용
        if (manualFields && manualFields[supplierField]) {
          value = manualFields[supplierField];
        }
        // 2. 매핑 규칙 적용
        else if (rules[supplierField]) {
          const orderField = rules[supplierField];
          
          // 고정값 패턴 확인
          if (orderField && orderField.includes('[고정값:')) {
            value = orderField.replace(/\[고정값:\s*(.+)\]/, '$1');
          }
          // 자동입력 패턴 확인
          else if (orderField && orderField.includes('[자동입력:')) {
            value = orderField.replace(/\[자동입력:\s*(.+)\]/, '$1');
          }
          // 일반 매핑
          else if (orderRowObject[orderField] !== undefined) {
            value = orderRowObject[orderField];
          }
        }
        // 3. 직접 매칭 (사용자가 명시적으로 매핑하지 않은 경우 빈 값 유지)
        // else if (orderRowObject[supplierField] !== undefined) {
        //   value = orderRowObject[supplierField];
        // }
        // 의도하지 않은 자동 매칭 방지 - 명시적 매핑만 허용
        
        // 객체를 문자열로 변환
        if (value && typeof value === 'object') {
          if (value.richText && Array.isArray(value.richText)) {
            value = value.richText.map(item => item.text || '').join('');
          } else if (Array.isArray(value)) {
            value = value.join(', ');
          } else if (value.toString) {
            value = value.toString();
          } else {
            value = JSON.stringify(value);
          }
        }
        
        // 숫자 필드 처리
        if (supplierField.includes('수량') || supplierField.includes('개수')) {
          value = value ? parseInt(value) : '';
        } else if (supplierField.includes('단가') || supplierField.includes('가격') || supplierField.includes('금액') || supplierField.includes('공급가액')) {
          value = value ? parseFloat(value) : '';
        }
        // 날짜/시간 필드 처리
        else if (isDateTimeField(supplierField)) {
          value = preserveDateTimeFormat(value, supplierField);
        }
        
        const cell = dataRow.getCell(colIndex + 1);
        cell.value = value;
        processedRow[supplierField] = value;
        
        // 테두리 추가
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      
      processedRows.push(processedRow);
      
    } catch (error) {
      errors.push({
        row: index + 1,
        error: error.message,
        data: rowData
      });
    }
  });
  
  // 합계 행 추가
  if (processedRows.length > 0) {
    const totalRow = worksheet.getRow(dataStartRow + orderData.length);
    
    templateFields.forEach((supplierField, colIndex) => {
      if (supplierField.includes('품목') || supplierField.includes('상품') || supplierField.includes('제품')) {
        totalRow.getCell(colIndex + 1).value = '합계';
        totalRow.getCell(colIndex + 1).font = { bold: true };
      } else if (supplierField.includes('수량') || supplierField.includes('개수')) {
        const totalQuantity = processedRows.reduce((sum, rowData) => {
          const value = rowData[supplierField] || 0;
          return sum + (parseInt(value) || 0);
        }, 0);
        if (totalQuantity > 0) {
          totalRow.getCell(colIndex + 1).value = totalQuantity;
          totalRow.getCell(colIndex + 1).font = { bold: true };
        }
      } else if (supplierField.includes('금액') || supplierField.includes('공급가액') || supplierField.includes('총액')) {
        const totalAmount = processedRows.reduce((sum, rowData) => {
          const value = rowData[supplierField] || 0;
          return sum + (parseFloat(value) || 0);
        }, 0);
        if (totalAmount > 0) {
          totalRow.getCell(colIndex + 1).value = totalAmount;
          totalRow.getCell(colIndex + 1).font = { bold: true };
        }
      }
    });
  }
  
  // 컬럼 너비 자동 조정
  templateFields.forEach((field, index) => {
    const column = worksheet.getColumn(index + 1);
    column.width = Math.max(field.length * 1.5, 10);
  });
  
  // 파일 저장
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
  const fileName = `purchase_order_${timestamp}.xlsx`;
  const outputPath = path.join(outputDir, fileName);
  
  try {
    await workbook.xlsx.writeFile(outputPath);
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ 발주서 생성 완료:', fileName);
    }
  } catch (writeError) {
    console.error('파일 저장 오류:', writeError.message);
    throw new Error('발주서 파일 저장에 실패했습니다.');
  }
  
  return {
    fileName,
    filePath: outputPath,
    processedRows: processedRows.length,
    totalRows: orderData.length,
    errors,
    templateFields: templateFields
  };
}



// 직접 입력 데이터를 표준 발주서로 변환
async function convertDirectInputToStandardFormat(templateFilePath, inputData, mappingRules, manualFields = {}) {
  try {
    const outputDir = getOutputDir();
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 입력 데이터를 배열 형태로 변환
    const transformedData = { headers: Object.keys(inputData), data: [inputData] };
    
    // 수동 필드 데이터 적용
    if (manualFields && Object.keys(manualFields).length > 0) {
      Object.keys(manualFields).forEach(fieldName => {
        transformedData.data[0][fieldName] = manualFields[fieldName];
      });
    }
    
    return await generatePurchaseOrder(templateFilePath, transformedData, mappingRules, manualFields);
    
  } catch (error) {
    console.error('직접 입력 변환 처리 오류:', error);
    throw new Error(`직접 입력 변환 중 오류가 발생했습니다: ${error.message}`);
  }
}

// XLSX 라이브러리로 헤더 추출
async function extractHeadersWithXLSX(templateFilePath, isHancomExcel = false) {
  console.log('🔍 헤더 추출 시작:', { templateFilePath, isHancomExcel });
  
  // 파일 존재 확인
  if (!fs.existsSync(templateFilePath)) {
    throw new Error(`템플릿 파일이 존재하지 않습니다: ${templateFilePath}`);
  }
  
  // 파일 크기 확인
  const fileStats = fs.statSync(templateFilePath);
  console.log('📊 템플릿 파일 정보:', {
    파일경로: templateFilePath,
    파일크기: fileStats.size,
    수정시간: fileStats.mtime
  });
  
  if (fileStats.size === 0) {
    throw new Error('템플릿 파일이 비어있습니다.');
  }

  // 🔄 1차 시도: XLSX 라이브러리
  try {
    console.log('📚 XLSX 라이브러리로 헤더 추출 시도...');
    
    // 한컴오피스 파일에 대한 특수 옵션 적용
    let xlsxOptions = {};
    if (isHancomExcel) {
      console.log('🏢 한컴오피스 Excel 파일 특수 옵션 적용');
      xlsxOptions = {
        codepage: 949,
        raw: false,
        dateNF: 'yyyy-mm-dd'
      };
    }
    
    const workbook = XLSX.readFile(templateFilePath, xlsxOptions);
    const sheetNames = workbook.SheetNames;
    
    console.log('📋 워크시트 정보:', {
      시트개수: sheetNames.length,
      시트이름들: sheetNames
    });
    
    if (sheetNames.length === 0) {
      throw new Error('워크시트가 없습니다.');
    }
    
    const firstSheet = workbook.Sheets[sheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    
    console.log('📊 XLSX 데이터 정보:', {
      전체행수: jsonData.length,
      첫번째행: jsonData[0],
      첫번째행길이: jsonData[0]?.length || 0,
      두번째행: jsonData[1],
      세번째행: jsonData[2]
    });
    
    if (jsonData.length === 0) {
      throw new Error('XLSX: 파일에 데이터가 없습니다.');
    }
    
    // 🔍 헤더가 있는 행 찾기 (첫 번째부터 최대 5번째 행까지 확인)
    let headerRow = null;
    let headerRowIndex = -1;
    
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
      const row = jsonData[i];
      if (row && Array.isArray(row) && row.length > 0) {
        // 빈 셀이 아닌 실제 데이터가 있는 셀이 있는지 확인
        const hasValidData = row.some(cell => 
          cell !== null && 
          cell !== undefined && 
          cell.toString().trim() !== ''
        );
        
        if (hasValidData) {
          headerRow = row;
          headerRowIndex = i;
          console.log(`✅ XLSX: ${i + 1}번째 행에서 헤더 발견:`, headerRow);
          break;
        }
      }
    }
    
    if (!headerRow) {
      throw new Error('XLSX: 파일에서 헤더를 찾을 수 없습니다.');
    }
    
    // 헤더 정제
    const cleanHeaders = headerRow
      .filter(cell => cell && cell.toString().trim() !== '')
      .map(cell => cell.toString().trim());
    
    console.log('✅ XLSX 헤더 추출 완료:', cleanHeaders);
    return cleanHeaders;
    
  } catch (xlsxError) {
    console.warn('⚠️ XLSX 라이브러리 실패:', xlsxError.message);
    
    // 🔄 2차 시도: ExcelJS 라이브러리
    try {
      console.log('📚 ExcelJS 라이브러리로 헤더 추출 시도...');
      
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      
      await workbook.xlsx.readFile(templateFilePath);
      
      console.log('📋 ExcelJS 워크시트 정보:', {
        시트개수: workbook.worksheets.length,
        시트이름들: workbook.worksheets.map(ws => ws.name)
      });
      
      if (workbook.worksheets.length === 0) {
        throw new Error('ExcelJS: 워크시트가 없습니다.');
      }
      
      const worksheet = workbook.worksheets[0];
      const headers = [];
      
      // 첫 5개 행 확인
      for (let rowNumber = 1; rowNumber <= Math.min(5, worksheet.rowCount); rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const rowValues = [];
        
        // 각 셀 값 추출
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          rowValues[colNumber - 1] = cell.value;
        });
        
        console.log(`📊 ExcelJS ${rowNumber}행:`, rowValues);
        
        // 유효한 데이터가 있는지 확인
        const hasValidData = rowValues.some(cell => 
          cell !== null && 
          cell !== undefined && 
          cell.toString().trim() !== ''
        );
        
        if (hasValidData) {
          const cleanHeaders = rowValues
            .filter(cell => cell && cell.toString().trim() !== '')
            .map(cell => cell.toString().trim());
          
          console.log(`✅ ExcelJS: ${rowNumber}번째 행에서 헤더 발견:`, cleanHeaders);
          return cleanHeaders;
        }
      }
      
      throw new Error('ExcelJS: 파일에서 헤더를 찾을 수 없습니다.');
      
    } catch (excelljsError) {
      console.error('❌ ExcelJS 라이브러리도 실패:', excelljsError.message);
      throw new Error(`파일 헤더 추출 실패 - XLSX: ${xlsxError.message}, ExcelJS: ${excelljsError.message}`);
    }
  }
}

module.exports = {
  convertToStandardFormat,
  convertDirectInputToStandardFormat,
  readExcelFile,
  generatePurchaseOrder,
  extractHeadersWithXLSX
}; 