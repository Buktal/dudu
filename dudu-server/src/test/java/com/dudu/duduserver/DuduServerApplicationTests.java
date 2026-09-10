package com.dudu.duduserver;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// 数据源未配置（MP/Flyway 接库前），冒烟测试暂排除 JDBC 自动装配，接库后移除
@SpringBootTest(properties = "spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration")
class DuduServerApplicationTests {

	@Test
	void contextLoads() {
	}

}
