/*
 * grabado が生成した Jakarta Persistence の entity（Kotlin）。
 *
 * **kotlin("plugin.jpa") が要る** —— JPA は引数の無いコンストラクタを求めるので、
 * コンストラクタ引数で書く形はプラグイン前提になる（Spring Initializr の既定）。
 * package 宣言は出さない（置き場所は生成物を受け取る側が決める）。
 */

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.IdClass
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.io.Serializable

@Entity
@Table(name = "employees")
class Employee(
    @Id
    @Column(name = "id")
    var id: Int,

    @Column(name = "name", nullable = false)
    var name: String,

    /** 直属の上長（自己参照） */
    @ManyToOne
    @JoinColumn(name = "manager_id", nullable = true)
    var manager: Employee? = null,
)

@Entity
@Table(name = "projects")
class Project(
    @Id
    @Column(name = "id")
    var id: Int,

    @Column(name = "title", nullable = false)
    var title: String,

    @ManyToOne
    @JoinColumn(name = "owner_id", nullable = false)
    var owner: Employee,

    @ManyToOne
    @JoinColumn(name = "team_id", nullable = true)
    var team: Team? = null,
)

@Entity
@Table(name = "teams")
class Team(
    @Id
    @Column(name = "id")
    var id: Int,

    @Column(name = "name", nullable = false)
    var name: String,
)

@Entity
@Table(name = "employee_projects")
@IdClass(EmployeeProjectId::class)
class EmployeeProject(
    @Id
    @Column(name = "employee_id")
    var employeeId: Int,

    @Id
    @Column(name = "project_id")
    var projectId: Int,
)

/** employee_projects の複合主キー（JPA は @IdClass に id クラスを要求する） */
data class EmployeeProjectId(
    var employeeId: Int? = null,
    var projectId: Int? = null,
) : Serializable