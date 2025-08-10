const express = require('express');
const { supabase } = require('../utils/supabase');
const { rateLimitMiddleware } = require('../utils/rateLimiter');

const router = express.Router();

// 📋 템플릿 목록 조회
router.get('/', async (req, res) => {
  try {
    console.log('📋 템플릿 목록 조회 요청');
    
    const { data: templates, error } = await supabase
      .from('order_templates')
      .select('*')
      .eq('is_active', true)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ 템플릿 조회 오류:', error);
      return res.status(500).json({ 
        error: '템플릿 조회 실패', 
        details: error.message 
      });
    }

    console.log(`✅ 템플릿 ${templates.length}개 조회 성공`);
    
    res.json({
      success: true,
      templates: templates.map(template => ({
        id: template.id,
        name: template.template_name,
        description: template.description,
        createdBy: template.created_by,
        createdAt: template.created_at,
        lastUsedAt: template.last_used_at,
        usageCount: template.usage_count
      }))
    });

  } catch (error) {
    console.error('❌ 템플릿 목록 조회 예외:', error);
    res.status(500).json({ 
      error: '템플릿 목록 조회 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 📖 특정 템플릿 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const templateId = req.params.id;
    console.log('📖 템플릿 상세 조회:', templateId);

    const { data: template, error } = await supabase
      .from('order_templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('❌ 템플릿 상세 조회 오류:', error);
      return res.status(500).json({ 
        error: '템플릿 조회 실패', 
        details: error.message 
      });
    }

    if (!template) {
      return res.status(404).json({ 
        error: '템플릿을 찾을 수 없습니다.' 
      });
    }

    console.log('✅ 템플릿 상세 조회 성공:', template.template_name);
    console.log('🔍 템플릿 데이터 구조 확인:', {
      id: template.id,
      hasSupplierMappingArray: !!(template.supplier_field_mapping_array),
      arrayType: typeof template.supplier_field_mapping_array,
      arrayLength: template.supplier_field_mapping_array?.length || 0,
      arrayFirstItem: template.supplier_field_mapping_array?.[0] || null
    });

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.template_name,
        description: template.description,
        orderFieldMapping: template.order_field_mapping,
        supplierFieldMapping: template.supplier_field_mapping,
        supplierFieldMappingArray: template.supplier_field_mapping_array, // ✅ 순서 보장 배열 추가
        fixedFields: template.fixed_fields,
        createdBy: template.created_by,
        createdAt: template.created_at,
        lastUsedAt: template.last_used_at,
        usageCount: template.usage_count
      }
    });

  } catch (error) {
    console.error('❌ 템플릿 상세 조회 예외:', error);
    res.status(500).json({ 
      error: '템플릿 조회 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 💾 템플릿 저장
router.post('/', async (req, res) => {
  try {
    const {
      templateName,
      description,
      orderFieldMapping,
      supplierFieldMapping,
      supplierFieldMappingArray, // 순서 보장을 위한 배열 (사용 안함)
      fixedFields,
      createdBy
    } = req.body;

    console.log('💾 템플릿 저장 요청:', {
      templateName,
      description,
      createdBy: createdBy || 'anonymous'
    });

    // 필수 데이터 검증
    if (!templateName || !orderFieldMapping || !supplierFieldMapping) {
      return res.status(400).json({ 
        error: '템플릿명, 주문서 매핑, 발주서 매핑은 필수입니다.' 
      });
    }

    // 입력값 정리 (공백 제거)
    const cleanedTemplateName = templateName.trim();
    const cleanedDescription = (description || '').trim();
    
    // 매핑 데이터 내부 필드명 공백 정리
    const cleanMapping = (mapping) => {
      const cleaned = {};
      Object.keys(mapping).forEach(key => {
        const cleanKey = key.trim();
        const cleanValue = typeof mapping[key] === 'string' ? mapping[key].trim() : mapping[key];
        if (cleanKey) { // 빈 키는 제외
          cleaned[cleanKey] = cleanValue;
        }
      });
      return cleaned;
    };
    
    const cleanedOrderFieldMapping = cleanMapping(orderFieldMapping);
    const cleanedSupplierFieldMapping = cleanMapping(supplierFieldMapping);
    const cleanedFixedFields = fixedFields ? cleanMapping(fixedFields) : {};

    // 중복 템플릿명 확인
    const { data: existingTemplate } = await supabase
      .from('order_templates')
      .select('id')
      .eq('template_name', cleanedTemplateName)
      .eq('is_active', true)
      .single();

    if (existingTemplate) {
      return res.status(409).json({ 
        error: '이미 존재하는 템플릿명입니다.' 
      });
    }

    // 순서 보장된 supplier_field_mapping 생성
    console.log('🔍 템플릿 저장 요청 데이터 검증:');
    console.log('📋 원본 supplierFieldMapping:', supplierFieldMapping);
    console.log('📋 cleanedSupplierFieldMapping:', cleanedSupplierFieldMapping);
    console.log('📋 supplierFieldMappingArray 존재:', !!supplierFieldMappingArray);
    console.log('📋 supplierFieldMappingArray 타입:', Array.isArray(supplierFieldMappingArray));
    console.log('📋 supplierFieldMappingArray 내용:', supplierFieldMappingArray);
    
    let orderedSupplierFieldMapping = cleanedSupplierFieldMapping;
    if (supplierFieldMappingArray && Array.isArray(supplierFieldMappingArray)) {
      console.log('✅ supplierFieldMappingArray를 사용하여 순서 보장된 매핑 생성');
      // 배열이 제공된 경우 순서에 따라 재정렬
      orderedSupplierFieldMapping = {};
      supplierFieldMappingArray
        .sort((a, b) => a.order - b.order) // order 필드로 정렬
        .forEach(item => {
          // supplier 필드가 있으면 저장 (order 필드가 빈 값이어도 포함)
          if (item.supplierField) {
            orderedSupplierFieldMapping[item.supplierField] = item.orderField || '';
          }
        });
      console.log('📋 순서 보장된 supplier_field_mapping:', orderedSupplierFieldMapping);
      console.log('📋 최종 키 순서:', Object.keys(orderedSupplierFieldMapping));
    } else {
      console.log('⚠️ supplierFieldMappingArray가 없어서 cleanedSupplierFieldMapping 사용');
      console.log('📋 기본 키 순서:', Object.keys(orderedSupplierFieldMapping));
    }

    // 템플릿 저장 (순서 배열 포함, 에러 핸들링 추가)
    const templateInsertData = {
      template_name: cleanedTemplateName,
      description: cleanedDescription,
      order_field_mapping: cleanedOrderFieldMapping,
      supplier_field_mapping: orderedSupplierFieldMapping, // 순서 보장된 매핑 저장 (검색용)
      fixed_fields: cleanedFixedFields,
      created_by: createdBy || 'anonymous'
    };
    
    // supplier_field_mapping_array가 있으면 추가 (순서 보장용)
    if (supplierFieldMappingArray && Array.isArray(supplierFieldMappingArray)) {
      templateInsertData.supplier_field_mapping_array = supplierFieldMappingArray;
      console.log('📋 순서 배열도 함께 저장:', supplierFieldMappingArray.length, '개 항목');
      console.log('🔍 저장할 배열 구조:', JSON.stringify(supplierFieldMappingArray.slice(0, 3), null, 2), '...');
      console.log('🎯 저장할 필드 순서:', supplierFieldMappingArray.map(item => `${item.order}: ${item.supplierField}`));
    } else {
      console.warn('⚠️ supplier_field_mapping_array가 없습니다! 순서 보장 불가');
      console.log('📋 받은 supplierFieldMappingArray:', typeof supplierFieldMappingArray, supplierFieldMappingArray);
    }
    
    // 첫 번째 시도: 순서 배열 포함하여 저장
    let { data: newTemplate, error } = await supabase
      .from('order_templates')
      .insert(templateInsertData)
      .select()
      .single();
    
    // supplier_field_mapping_array 컬럼이 없는 경우 백업 로직
    if (error && error.code === 'PGRST204' && error.message.includes('supplier_field_mapping_array')) {
      console.log('⚠️ supplier_field_mapping_array 컬럼이 없음, 순서 배열 제외하고 재시도');
      
      // 순서 배열 제거하고 다시 시도
      const backupInsertData = { ...templateInsertData };
      delete backupInsertData.supplier_field_mapping_array;
      
      const backupResult = await supabase
        .from('order_templates')
        .insert(backupInsertData)
        .select()
        .single();
      
      newTemplate = backupResult.data;
      error = backupResult.error;
      
      if (!backupResult.error) {
        console.log('✅ 순서 배열 없이 템플릿 저장 성공 (백업 로직)');
        console.log('💡 Supabase 스키마 캐시를 새로고침하거나 프로젝트를 재시작해주세요.');
      }
    }

    if (error) {
      console.error('❌ 템플릿 저장 오류:', error);
      console.error('❌ 오류 상세:', JSON.stringify(error, null, 2));
      console.error('❌ 저장하려던 데이터:', {
        template_name: cleanedTemplateName,
        description: cleanedDescription,
        order_field_mapping: cleanedOrderFieldMapping,
        supplier_field_mapping: orderedSupplierFieldMapping,
        fixed_fields: cleanedFixedFields,
        created_by: createdBy || 'anonymous'
      });
      return res.status(500).json({ 
        error: `템플릿 저장에 실패했습니다: ${error.message}`,
        details: error
      });
    }

    console.log('✅ 템플릿 저장 성공:', {
      id: newTemplate.id,
      name: newTemplate.template_name
    });

    res.json({
      success: true,
      message: '템플릿이 성공적으로 저장되었습니다.',
      template: {
        id: newTemplate.id,
        name: newTemplate.template_name,
        description: newTemplate.description,
        createdAt: newTemplate.created_at
      }
    });

  } catch (error) {
    console.error('❌ 템플릿 저장 예외:', error);
    res.status(500).json({ 
      error: '템플릿 저장 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 🔄 템플릿 수정
router.put('/:id', async (req, res) => {
  try {
    const templateId = req.params.id;
    const {
      templateName,
      description,
      orderFieldMapping,
      supplierFieldMapping,
      supplierFieldMappingArray, // 순서 보장을 위한 배열
      fixedFields
    } = req.body;

    console.log('🔄 템플릿 수정 요청:', templateId);

    // 필수 데이터 검증
    if (!templateName || !orderFieldMapping || !supplierFieldMapping) {
      return res.status(400).json({ 
        error: '템플릿명, 주문서 매핑, 발주서 매핑은 필수입니다.' 
      });
    }

    // 입력값 정리 (공백 제거)
    const cleanedTemplateName = templateName.trim();
    const cleanedDescription = (description || '').trim();
    
    // 매핑 데이터 내부 필드명 공백 정리
    const cleanMapping = (mapping) => {
      const cleaned = {};
      Object.keys(mapping).forEach(key => {
        const cleanKey = key.trim();
        const cleanValue = typeof mapping[key] === 'string' ? mapping[key].trim() : mapping[key];
        if (cleanKey) { // 빈 키는 제외
          cleaned[cleanKey] = cleanValue;
        }
      });
      return cleaned;
    };
    
    const cleanedOrderFieldMapping = cleanMapping(orderFieldMapping);
    const cleanedSupplierFieldMapping = cleanMapping(supplierFieldMapping);
    const cleanedFixedFields = fixedFields ? cleanMapping(fixedFields) : {};

    // 중복 템플릿명 확인 (자기 자신 제외)
    const { data: existingTemplate } = await supabase
      .from('order_templates')
      .select('id')
      .eq('template_name', cleanedTemplateName)
      .eq('is_active', true)
      .neq('id', templateId)
      .single();

    if (existingTemplate) {
      return res.status(409).json({ 
        error: '이미 존재하는 템플릿명입니다.' 
      });
    }

    // 순서 보장된 supplier_field_mapping 생성
    let orderedSupplierFieldMapping = cleanedSupplierFieldMapping;
    if (supplierFieldMappingArray && Array.isArray(supplierFieldMappingArray)) {
      // 배열이 제공된 경우 순서에 따라 재정렬
      orderedSupplierFieldMapping = {};
      supplierFieldMappingArray
        .sort((a, b) => a.order - b.order) // order 필드로 정렬
        .forEach(item => {
          if (item.supplierField && item.orderField) {
            orderedSupplierFieldMapping[item.supplierField] = item.orderField;
          }
        });
      console.log('📋 템플릿 수정 - 순서 보장된 supplier_field_mapping:', orderedSupplierFieldMapping);
    }

    // 템플릿 수정 (순서 배열 포함, 에러 핸들링 추가)
    const templateUpdateData = {
      template_name: cleanedTemplateName,
      description: cleanedDescription,
      order_field_mapping: cleanedOrderFieldMapping,
      supplier_field_mapping: orderedSupplierFieldMapping, // 순서 보장된 매핑 저장
      fixed_fields: cleanedFixedFields
    };
    
    // supplier_field_mapping_array가 있으면 추가 (순서 보장용)
    if (supplierFieldMappingArray && Array.isArray(supplierFieldMappingArray)) {
      templateUpdateData.supplier_field_mapping_array = supplierFieldMappingArray;
      console.log('📋 템플릿 수정 - 순서 배열도 함께 저장:', supplierFieldMappingArray.length, '개 항목');
    }
    
    // 첫 번째 시도: 순서 배열 포함하여 수정
    let { data: updatedTemplate, error } = await supabase
      .from('order_templates')
      .update(templateUpdateData)
      .eq('id', templateId)
      .eq('is_active', true)
      .select()
      .single();
    
    // supplier_field_mapping_array 컬럼이 없는 경우 백업 로직
    if (error && error.code === 'PGRST204' && error.message.includes('supplier_field_mapping_array')) {
      console.log('⚠️ 템플릿 수정 시 supplier_field_mapping_array 컬럼이 없음, 순서 배열 제외하고 재시도');
      
      // 순서 배열 제거하고 다시 시도
      const backupUpdateData = { ...templateUpdateData };
      delete backupUpdateData.supplier_field_mapping_array;
      
      const backupResult = await supabase
        .from('order_templates')
        .update(backupUpdateData)
        .eq('id', templateId)
        .eq('is_active', true)
        .select()
        .single();
      
      updatedTemplate = backupResult.data;
      error = backupResult.error;
      
      if (!backupResult.error) {
        console.log('✅ 순서 배열 없이 템플릿 수정 성공 (백업 로직)');
        console.log('💡 Supabase 스키마 캐시를 새로고침하거나 프로젝트를 재시작해주세요.');
      }
    }

    if (error) {
      console.error('❌ 템플릿 수정 오류:', error);
      return res.status(500).json({ 
        error: '템플릿 수정 실패', 
        details: error.message 
      });
    }

    if (!updatedTemplate) {
      return res.status(404).json({ 
        error: '수정할 템플릿을 찾을 수 없습니다.' 
      });
    }

    console.log('✅ 템플릿 수정 성공:', updatedTemplate.template_name);

    res.json({
      success: true,
      message: '템플릿이 성공적으로 수정되었습니다.',
      template: {
        id: updatedTemplate.id,
        name: updatedTemplate.template_name,
        description: updatedTemplate.description,
        updatedAt: updatedTemplate.updated_at
      }
    });

  } catch (error) {
    console.error('❌ 템플릿 수정 예외:', error);
    res.status(500).json({ 
      error: '템플릿 수정 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 🗑️ 템플릿 삭제 (소프트 딜리트)
router.delete('/:id', async (req, res) => {
  try {
    const templateId = req.params.id;
    console.log('🗑️ 템플릿 삭제 요청:', templateId);

    // 템플릿을 비활성화 (소프트 딜리트)
    const { data: deletedTemplate, error } = await supabase
      .from('order_templates')
      .update({ is_active: false })
      .eq('id', templateId)
      .eq('is_active', true)
      .select('template_name')
      .single();

    if (error) {
      console.error('❌ 템플릿 삭제 오류:', error);
      return res.status(500).json({ 
        error: '템플릿 삭제 실패', 
        details: error.message 
      });
    }

    if (!deletedTemplate) {
      return res.status(404).json({ 
        error: '삭제할 템플릿을 찾을 수 없습니다.' 
      });
    }

    console.log('✅ 템플릿 삭제 성공:', deletedTemplate.template_name);

    res.json({
      success: true,
      message: '템플릿이 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('❌ 템플릿 삭제 예외:', error);
    res.status(500).json({ 
      error: '템플릿 삭제 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 🚀 템플릿 사용 (사용 통계 업데이트)
router.post('/:id/use', async (req, res) => {
  try {
    const templateId = req.params.id;
    console.log('🚀 템플릿 사용 통계 업데이트:', templateId);

    // 1. 현재 사용 횟수 가져오기
    const { data: currentTemplate, error: fetchError } = await supabase
      .from('order_templates')
      .select('usage_count')
      .eq('id', templateId)
      .eq('is_active', true)
      .single();

    if (fetchError) {
      console.error('❌ 템플릿 조회 오류:', fetchError);
      // 통계 업데이트 실패는 심각한 오류가 아니므로 경고만 로그
      console.warn('⚠️ 템플릿 사용 통계 업데이트 실패, 계속 진행');
    } else {
      // 2. 사용 통계 업데이트 (+1)
      const newUsageCount = (currentTemplate.usage_count || 0) + 1;
      
      const { error: updateError } = await supabase
        .from('order_templates')
        .update({ 
          usage_count: newUsageCount,
          last_used_at: new Date().toISOString()
        })
        .eq('id', templateId)
        .eq('is_active', true);

      if (updateError) {
        console.error('❌ 템플릿 사용 통계 업데이트 오류:', updateError);
        console.warn('⚠️ 템플릿 사용 통계 업데이트 실패, 계속 진행');
      } else {
        console.log('✅ 템플릿 사용 통계 업데이트 성공:', {
          templateId,
          newUsageCount,
          timestamp: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      message: '템플릿 사용 통계가 업데이트되었습니다.'
    });

  } catch (error) {
    console.error('❌ 템플릿 사용 통계 업데이트 예외:', error);
    // 통계 업데이트 실패는 심각한 오류가 아니므로 성공으로 응답
    res.json({
      success: true,
      message: '템플릿 사용 통계 업데이트 중 오류가 발생했지만 계속 진행합니다.'
    });
  }
});

module.exports = router; 