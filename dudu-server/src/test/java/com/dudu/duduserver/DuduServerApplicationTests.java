package com.dudu.duduserver;

import com.dudu.duduserver.testutil.NoDatasourceSpringTest;
import org.junit.jupiter.api.Test;

// 数据源未配置（MP/Flyway 接库前），冒烟测试暂排除 JDBC 自动装配，接库后移除
class DuduServerApplicationTests extends NoDatasourceSpringTest {

    @Test
    void contextLoads() {
    }

}
