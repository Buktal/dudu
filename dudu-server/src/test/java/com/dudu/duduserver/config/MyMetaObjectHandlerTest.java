package com.dudu.duduserver.config;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.reflection.SystemMetaObject;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class MyMetaObjectHandlerTest {

    @TableName("fill_fixture")
    static class FillFixture {
        @TableField(value = "create_time", fill = FieldFill.INSERT)
        private LocalDateTime createTime;

        @TableField(value = "update_time", fill = FieldFill.INSERT_UPDATE)
        private LocalDateTime updateTime;

        public LocalDateTime getCreateTime() {
            return createTime;
        }

        public void setCreateTime(LocalDateTime createTime) {
            this.createTime = createTime;
        }

        public LocalDateTime getUpdateTime() {
            return updateTime;
        }

        public void setUpdateTime(LocalDateTime updateTime) {
            this.updateTime = updateTime;
        }
    }

    private final MyMetaObjectHandler handler = new MyMetaObjectHandler();

    @BeforeAll
    static void registerTableInfo() {
        // strictFill 依赖 TableInfo 元数据；无 DB 环境下手动注册测试 fixture
        TableInfoHelper.initTableInfo(
            new MapperBuilderAssistant(new MybatisConfiguration(), ""), FillFixture.class);
    }

    @Test
    void insertFillSetsBothTimeColumns() {
        FillFixture entity = new FillFixture();

        handler.insertFill(SystemMetaObject.forObject(entity));

        assertThat(entity.getCreateTime()).isNotNull();
        assertThat(entity.getUpdateTime()).isNotNull();
        assertThat(entity.getUpdateTime()).isEqualTo(entity.getCreateTime());
    }

    @Test
    void updateFillTouchesUpdateTimeOnly() {
        FillFixture entity = new FillFixture();
        entity.setCreateTime(LocalDateTime.of(2026, 1, 1, 0, 0));
        entity.setUpdateTime(LocalDateTime.of(2026, 1, 1, 0, 0));

        handler.updateFill(SystemMetaObject.forObject(entity));

        assertThat(entity.getUpdateTime()).isAfter(LocalDateTime.of(2026, 1, 1, 0, 0));
        assertThat(entity.getCreateTime()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
    }
}
